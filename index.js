#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const puppeteer = require('puppeteer');

const cwd = process.cwd();
const debug = process.env.DEBUG;

const word = (data) => {
    'use strict';
    return String(data).replace(/\W+/g, '');
};
const stdout = (ln) => {
    'use strict';
    stdout.count++;
    process.stdout.write(`${ln}\n`);
};
const stderr = (ln) => {
    'use strict';
    stderr.count++;
    process.stderr.write(`${ln}\n`);
};
stdout.count = 0;
stderr.count = 0;

class FS {
    static ls(dir, regex = false, result = []) {
        const files = fs.readdirSync(dir);

        for (let i = files.length; i--;) {
            const file = path.join(dir, files[i]);

            if (this.isDir(file)) {
                result = this.ls(file, regex, result);
            }
            else if (!regex || regex.test(file)) {
                result.push(file);
            }
        }
        return result;
    }

    static rm(path) {
        if (!path.includes(cwd) || path.replace(cwd, '').length < 5) {
            throw new Error(`Potentially unexpected removal... ${path}`);
        }
        if (debug) {
            console.log(`INFO: Removing ${path}`);
        }
        return fs.rmSync(path, {recursive: true, force: true});
    }

    static mkdir(...paths) {
        try {
            fs.mkdirSync(path.join(...paths), {recursive: true});
            return true;
        }
        catch (ex) {
            console.error(ex);
            return false;
        }
    }

    static stat(path) {
        try {
            return fs.statSync(path);
        }
        catch (ex) {
            return false;
        }
    }

    static isDir(path) {
        const s = this.stat(path);
        return s && s.isDirectory();
    }

    static read(file) {
        try {
            if (!FS.stat(file) && FS.stat(`${file}.gz`)) {
                file += '.gz';
            }
            let data = fs.readFileSync(file);

            if (file.endsWith('.gz')) {
                data = zlib.gunzipSync(data);
            }
            return data.toString('utf8');
        }
        catch (ex) {
            console.error(`Failed reading "${file}"`, ex);
            return null;
        }
    }

    static write(file, data, compress, force) {
        try {
            if (compress) {
                data = zlib.gzipSync(data, {level: zlib.constants.Z_BEST_COMPRESSION});
                file += '.gz';
            }
            if (!force && FS.stat(file)) {
                throw new Error('File exists.');
            }
            fs.writeFileSync(file, data);
            return true;
        }
        catch (ex) {
            console.error(`Failed writing to "${file}"`, ex);
            return false;
        }
    }

    static async readStream(stream = process.stdin, delim = /\n\r?\n$/) {
        let data = '';
        const {isTTY} = stream;

        for await (const chunk of stream) {
            data += chunk.toString('utf8');

            if (isTTY && delim && delim.test(data)) {
                break;
            }
        }
        return data;
    }

    static prompt(text = '') {
        const {stdin} = process;
        const {isTTY} = stdin;

        if (isTTY && text) {
            process.stdout.write(`${text} `);
        }
        return FS.readStream(stdin);
    }
}

const config = {
    COMPRESS: !process.env.NOCOMPRESS,
    MOBILE_DEVICE: process.env.MOBILE_DEVICE || 'iPhone 8 Plus',
    ARCHIVE_PATH: process.env.ARCHIVE_PATH || path.join(cwd, 'archive'),

    sites: {
        'mega.nz': {
            embed: true,
            mobile: true,
            hash: 'no-redirect',
            async preload(page) {
                'use strict';
                if (!config.last) {
                    return page.evaluate(async() => Promise.resolve(M.require('chat')));
                }
            },
            parser(blobs) {
                'use strict';
                let type;
                const files = [];

                for (let i = blobs.length; i--;) {
                    const [src, content] = blobs[i];

                    type = null;
                    switch (content[1]) {
                        case ' *   sjcl.js':
                            if (String(content[6]).includes('embedplayer.js')) {
                                type = 'embed';
                            }
                            else if (String(content).includes('the mobile web site')) {
                                type = 'mobile';
                            }
                            else {
                                type = 'main';
                            }
                            break;
                        case ' * var handler = {':
                            type = 'chat';
                            break;
                        default: {
                            const exclude = /^es6s|css\//.test(content.slice(0, 2))
                                || String(content).slice(35).startsWith('IllegalStateError');

                            if (exclude) {
                                continue;
                            }
                        }
                    }

                    if (type) {
                        files.push([`meganz.${type}.js`, content]);
                    }
                    else {
                        stderr(`Unknown blob, ${src}: ${String(content).slice(0, 96)}`);
                    }
                }

                return files;
            }
        },
        'mega.io': {
            parser(blobs) {
                'use strict';

                if (blobs.length !== 2) {
                    console.warn(`[!] Unexpected number of blobs (${blobs.length}) for MEGA.io!`);
                }

                const [, [, content]] = blobs;

                if (content[2] === ' *   js/jquery.protect.js') {
                    return [['megaio.main.js', content]];
                }

                stderr(`[!] Unexpected blob for MEGA.io: ${content.slice(0, 9)}`);
            }
        }
    },
    last: null
};

async function getSiteBlobs(page) {
    'use strict';

    return page.evaluate(async() => {
        const result = [];

        for (const elm of document.querySelectorAll('script[src^="blob:"]')) {
            const {src} = elm;
            const response = await fetch(src).catch(console.error);

            if (response) {
                result.push([src, String(await response.text()).split('\n')]);
            }
        }

        return result;
    });
}

async function getSiteVersion(page) {
    'use strict';
    return page.evaluate('buildVersion');
}

async function launch(url, selector, device) {
    'use strict';

    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    page
        .on('console', (message) => {
            if (debug) {
                console.log(`${message.type().substr(0, 3).toUpperCase()} ${message.text()}`);
            }
        })
        .on('pageerror', ({message}) => {
            stderr(message);
        })
        .on('response', (response) => {
            if (debug > 1) {
                console.log(`${response.status()} ${response.url()}`);
            }
        })
        .on('requestfailed', (request) => {
            stderr(`${Object(request.failure()).errorText} ${request.url()}`);
        });

    if (device) {
        await page.emulate(puppeteer.devices[device]);
    }
    await page.goto(url);
    await page.evaluate(async() => {
        URL.revokeObjectURL = nop;
    });

    if (selector) {
        await page.waitForSelector(selector);
    }

    return {
        page,
        async close() {
            return browser.close();
        }
    };
}

async function siteHandler(domain, page, target, options) {
    'use strict';
    const {parser, preload} = options;

    if (preload) {
        await preload(page);
    }
    const files = parser(await getSiteBlobs(page));

    for (let i = files.length; i--;) {
        const [name, content] = files[i];

        if (!FS.write(path.join(target, name), content.join('\n'), config.COMPRESS)) {
            return null;
        }
    }

    return true;
}

async function archive() {
    'use strict';

    for (const domain in config.sites) {
        const opt = config.sites[domain];
        const url = `https://${domain}/${opt.path || ''}#${opt.hash || ''}`;
        const selector = opt.waitSelector || '.startpage.register';

        const {page, close} = await launch(url, selector);
        const {website: version, timestamp, commit} = await getSiteVersion(page);

        if (debug) {
            const hub = `https://github.com/meganz/webclient/commit/${commit.substr(0, 13)}`;
            console.info(`[!] ${domain} is using version ${version}, ${hub}`);
        }

        const folder = `${timestamp}-${version}`;
        const target = path.join(config.ARCHIVE_PATH, folder);
        const exists = FS.stat(target);

        if (!config.last || !FS.mkdir(target)) {

            if (exists || !FS.mkdir(target)) {
                if (exists) {
                    console.debug(`[!] Current version already archived.`);
                }
                await close();
                break;
            }

            FS.write(path.join(config.ARCHIVE_PATH, 'last'), folder, false, true);
        }

        const result = await siteHandler(domain, page, target, opt).catch(stderr);
        await close();

        if (!result) {
            FS.rm(target);
            break;
        }
        config.last = folder;

        if (opt.mobile) {
            const {page, close} = await launch(url, selector, config.MOBILE_DEVICE);
            await siteHandler(domain, page, target, opt);
            await close();
        }

        if (opt.embed) {
            const {page, close} = await launch(`https://${domain}/embed/AAA`, '.embedplayer');
            await siteHandler(domain, page, target, opt);
            await close();
        }
    }
}

function getArchivedFile(ver = 'last', domain = 'meganz', type = 'main') {
    let version = config.last;

    if (ver !== 'last' && String(version).split('-')[1] !== ver) {
        const ls = fs.readdirSync(config.ARCHIVE_PATH);

        for (let i = ls.length; i--;) {
            const [, v] = ls[i].split('-');

            if (v === ver) {
                version = ls[i];
                break;
            }
        }

        if (version === config.last) {
            stderr(`Version ${ver} not found, using last.`);
        }
    }

    const data = FS.read(path.join(config.ARCHIVE_PATH, version, `${domain}.${type}.js`));
    if (!data) {
        process.exit(1);
    }
    return data;
}

function printCodeAt(data, ln, bc = 0, ac = 0) {
    const n = ln - 1;
    const c = Math.max(0, n - bc);

    String(data).split('\n')
        .slice(c, 1 + c + bc + ac)
        .forEach((x, i) => {
            stdout(`${(c + i === n ? '\x1b[31m' : '') + String(c + i + 1).padStart(7, ' ')}  ${x}\x1b[0m`);
        });
}


const usage = `
${process.argv[1].replace(/^.*[/\\]/, '')} [<options...>|line-number]

OPTIONS:
-h, --help                   This help text.
-a, --archive                Archive current site bundles.
-d, --domain <name>          Domain to use for subsequent options (default: mega.nz)
-f, --file <name>            Locate exception under specific bundle name (default: main)
-v, --version <tag>          Find code on specific version (default: last archived)
-n, --line <n>               Print code at specified source line number.
-B, --before <n>             Show N lines of leading code (default: 9)
-A, --after <n>              Show N lines of trailing code (default: 4)
-t, --dump                   Parse stack-trace dump from stdin.
-i, --interactive            Enter interactive mode.
`;
const argv = process.argv.slice(2);

if (!argv.length) {
    argv.unshift('-a');
}
else if (argv.length === 1 && parseInt(argv[0]) === (argv[0] | 0)) {
    argv.unshift('-n');
}
argv.file = 'main';
argv.domain = 'meganz';
argv.ver = 'last';
argv.arc = 0;
argv.ln = 0;
argv.bc = 9;
argv.ac = 4;

for (let i = 0; i < argv.length; ++i) {
    switch (word(argv[i])) {
        case 'h':
        case 'help':
            stderr(usage);
            process.exit(1);
            break;
        case 'a':
        case 'archive':
            argv.arc = 1;
            break;
        case 'd':
        case 'domain':
            argv.domain = word(argv[++i]);
            break;
        case 'f':
        case 'file':
            argv.file = word(argv[++i]);
            break;
        case 'n':
        case 'line':
            argv.ln = parseInt(argv[++i]);
            break;
        case 'v':
        case 'version':
            argv.ver = String(argv[++i]).replace(/[^\d.]+/g, '').replace(/\.+/g, '.');
            break;
        case 't':
        case 'dump':
            argv.dump = true;
            break;
        case 'B':
        case 'before':
            argv.bc = parseInt(argv[++i]) | 0;
            break;
        case 'A':
        case 'after':
            argv.ac = parseInt(argv[++i]) | 0;
            break;
        default:
            stderr(`Unknown option "${argv[i]}"`);
            stderr(usage);
            process.exit(1);
    }
}

(async(argv) => {
    'use strict';

    if (!argv.arc) {
        const stat = FS.stat(path.join(config.ARCHIVE_PATH, 'last'));
        argv.arc = !stat || Number(stat.mtime) + 864e5 * 7 < Date.now();
    }

    if (argv.arc) {
        await archive();

        if (stderr.count > 0) {
            process.exit(1);
        }
    }

    if (!config.last) {
        config.last = FS.read(path.join(config.ARCHIVE_PATH, 'last'));
    }

    if (argv.ln > 0) {
        printCodeAt(getArchivedFile(argv.ver, argv.domain, argv.file), argv.ln, argv.bc, argv.ac);
    }
    else if (argv.dump) {
        const file = getArchivedFile(argv.ver, argv.domain, argv.file);
        const input = String(await FS.prompt('Paste stack-trace (^C to quit):').catch(stderr)).split('\n');

        input.map((line) => String(line.split(/\s\(|@/)[1]).split(':')[1])
            .forEach((ln, idx) => {
                if (parseInt(ln) > 0) {
                    stdout(`\n: ${input[idx].trim()}`);
                    printCodeAt(file, ln, argv.bc, argv.ac);
                }
            });
    }
})(argv);
