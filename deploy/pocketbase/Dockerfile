FROM ghcr.io/muchobien/pocketbase:0.25.8

COPY pb_hooks /pb_hooks
COPY pb_migrations /pb_migrations

EXPOSE 8080

# Override the image entrypoint so we don't append a second `serve` and so we
# bind the Fly http_service port (8080) with our migrations/hooks dirs.
ENTRYPOINT ["/usr/local/bin/pocketbase"]
CMD ["serve", "--http=0.0.0.0:8080", "--dir=/pb_data", "--hooksDir=/pb_hooks", "--migrationsDir=/pb_migrations"]
