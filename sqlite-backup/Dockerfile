FROM alpine:3.23
RUN apk add --no-cache sqlite cronie
COPY backup.sh /usr/local/bin/backup
COPY entrypoint.sh /usr/local/bin/entrypoint
RUN chmod +x /usr/local/bin/backup /usr/local/bin/entrypoint
ENV STAGING_DIR=/staging
ENTRYPOINT ["/usr/local/bin/entrypoint"]
