FROM ubuntu:18.04

RUN apt update
RUN apt -y upgrade
RUN apt install ruby-dev make g++ zlib1g-dev pkg-config -y
RUN gem install github-pages
RUN gem install jekyll-paginate

ADD . /site
WORKDIR /site
RUN jekyll build

EXPOSE 4000
#ENTRYPOINT [ "jekyll", "serve", "-H", "0.0.0.0" ]
CMD [ "jekyll", "serve", "-H", "0.0.0.0" ]

#CMD [ "bundle", "exec", "jekyll", "serve", "-H", "0.0.0.0" ]

