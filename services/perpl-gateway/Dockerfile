# Build the LEASH Perpl gateway. Multi-stage: compile with the pinned Rust
# toolchain, run on a slim Debian base.
FROM rust:1.94-bookworm AS build
WORKDIR /app
COPY Cargo.toml rust-toolchain.toml ./
COPY src ./src
# Build a release binary. (Add Cargo.lock to the image for reproducible builds
# once the lane is stable.)
RUN cargo build --release --locked || cargo build --release

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/target/release/perpl-gateway /usr/local/bin/perpl-gateway
# Keystore + SQLite live under /data (mount a volume in prod).
ENV GATEWAY_DB_PATH=/data/gateway.sqlite
ENV GATEWAY_KEYSTORE_DIR=/data/keystore
ENV GATEWAY_BIND=0.0.0.0:8080
EXPOSE 8080
VOLUME ["/data"]
CMD ["perpl-gateway"]
