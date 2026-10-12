# Gateway mock responses

Static JSON matching the gateway OpenAPI (`packages/shared/gateway.openapi.yaml`,
ARCHITECTURE §7.3), so Brain and Face can build against stable shapes before the
live gateway is up at CP1.

Serve them with any static server, e.g.:

```bash
# from this directory
python3 -m http.server 8080
# GET http://localhost:8080/health.json etc.
```

| Endpoint | Mock file |
|---|---|
| `GET /health` | `health.json` |
| `GET /markets` | `markets.json` |
| `GET /book/:market` | `book.json` |
| `GET /account/:address` | `account.json` |
| `GET /risk/:address` | `risk.json` |
| `POST /orders/prepare` | `orders-prepare.json` |
| `POST /orders/execute` | `orders-execute.json` |
| `POST /deposit/prepare` | `deposit-prepare.json` |
| `POST /keys/prepare` | `keys-prepare.json` |
| `POST /keys/disable` | `ack.json` |

Values are illustrative; the live gateway returns real exchange state.
