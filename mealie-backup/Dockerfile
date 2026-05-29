FROM alpine:3.23
RUN apk add --no-cache curl cronie
COPY backup.sh /usr/local/bin/backup
COPY entrypoint.sh /usr/local/bin/entrypoint
RUN chmod +x /usr/local/bin/backup /usr/local/bin/entrypoint
ENV MEALIE_URL=http://mealie_mealie:9000 \
    MEALIE_DATA_DIR=/mealie-data \
    STAGING_DIR=/staging
ENTRYPOINT ["/usr/local/bin/entrypoint"]
