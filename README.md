# blofetcha

[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)

This very simple NodeJS application is meant to archive JS bundles served on MEGA domains, which are
dynamically-generated at runtime when visiting the site, and ultimately to ease tracing reported JS exceptions.

---

## Requirements

For development, you will only need Node.js and a node global package, installed in your environment.

### NodeJS

- #### Node installation on Windows

  Just go on [official Node.js website](https://nodejs.org/) and download the installer.
  Also, be sure to have `git` available in your PATH, `npm` might need it (You can find
  git [here](https://git-scm.com/)).

- #### Node installation on Ubuntu

  You can install nodejs and npm easily with apt install, just run the following commands.

      $ sudo apt install nodejs
      $ sudo apt install npm

- #### Other Operating Systems
  You can find more information about the installation on the [official Node.js website](https://nodejs.org/) and
  the [official NPM website](https://npmjs.org/).

If the installation was successful, you should be able to run the following command.

    $ node --version
    vx.x.x

---

## Install

    $ git clone https://github.com/meganz/blofetcha.git
    $ cd blofetcha
    $ npm install

## Configure app

Some options are available through environment variables:

- NOCOMPRESS: By default, the bundles will be archived using gzip.
- MOBILE_DEVICE: What mobile device to emulate.
- ARCHIVE_PATH: Where to archive the bundles.
- DEBUG: Enable debugging mode.

## Running the project

    $ npm start

This will run the app in archive-only mode and exit, creating gzipped bundles as below:

    $ ls -Rl archive
    archive:
    total 1
    drwxr-xr-x 1 dc adm  0 jun. 19 14:17 1655340486-4.15.10/
    -rw-r--r-- 1 dc adm 18 jun. 19 14:17 last

    archive/1655340486-4.15.10:
    total 3348
    -rw-r--r-- 1 dc adm  410476 jun. 19 14:17 megaio.main.js.gz
    -rw-r--r-- 1 dc adm  646409 jun. 19 14:17 meganz.chat.js.gz
    -rw-r--r-- 1 dc adm  348825 jun. 19 14:17 meganz.embed.js.gz
    -rw-r--r-- 1 dc adm 1420329 jun. 19 14:17 meganz.main.js.gz
    -rw-r--r-- 1 dc adm 1237968 jun. 19 14:17 meganz.mobile.js.gz

Where `1655340486` is the timestamp, and `4.15.10` the site version.

## Docker

To build the docker image execute:

    docker build . -t blofetcha

To run the Docker image created above, execute:

    docker run -e DISABLE_CHROME_SANDBOX=true -v /home/usre/code/blofetcha/docker-archive:/archive blofetcha

NOTE: The mounted "docker-archive" volume will contain the archived Javascript files
NOTE2: Currently the files are output as having `root:root` permissions and need to be changed after

## Usage

Enter the following command to get usage information:

    $ ./index.js -h

## Finding where exceptions do point out:

    TypeError: null is not an object
    Line: 119979
    Stack:
    @..:119979:41
    @..:165296:26
    dispatch@..:9237:32

Given the above exception, you would run `./index.js 119979` which should give back:

```diff
# 119973          if (!e || !e.target.closest('.create-new-folder') &&
# 119974              (!c || !c.includes('fm-new-folder'))) {
# 119975
# 119976              var c3;
# 119977
# 119978              if (e && e.target) {
- 119979                  c3 = e.target.parentNode.className;
# 119980              }
# 119981
# 119982              if (!c3 || c3.indexOf('fm-new-folder') === -1) {
# 119983
```

## Interactive mode and other advanced usages.

TBD.
