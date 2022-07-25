FROM debian

RUN apt update && apt install -y curl
RUN curl -fsSL https://deb.nodesource.com/setup_16.x | bash -
RUN apt-get install -y nodejs

# NOTE: We are only installing chromium to get its dependencies
RUN apt install -y chromium

ADD index.js .
ADD package.json .

RUN npm install

ENTRYPOINT ["npm", "start"]
