//! Gateway error type with stable, machine-readable error codes. The agent and
//! the app branch on `code`; `message` is for humans.

use axum::{Json, http::StatusCode, response::IntoResponse};
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Code {
    MandateInactive,
    StaleCache,
    MarketNotAllowed,
    SizeExceedsMax,
    KeyDisabled,
    NoKey,
    NotFound,
    BadRequest,
    Upstream,
    Internal,
    Unauthorized,
}

impl Code {
    pub fn as_str(&self) -> &'static str {
        match self {
            Code::MandateInactive => "MANDATE_INACTIVE",
            Code::StaleCache => "STALE_CACHE",
            Code::MarketNotAllowed => "MARKET_NOT_ALLOWED",
            Code::SizeExceedsMax => "SIZE_EXCEEDS_MAX",
            Code::KeyDisabled => "KEY_DISABLED",
            Code::NoKey => "NO_KEY",
            Code::NotFound => "NOT_FOUND",
            Code::BadRequest => "BAD_REQUEST",
            Code::Upstream => "UPSTREAM_ERROR",
            Code::Internal => "INTERNAL_ERROR",
            Code::Unauthorized => "UNAUTHORIZED",
        }
    }

    fn status(&self) -> StatusCode {
        match self {
            Code::MandateInactive
            | Code::StaleCache
            | Code::MarketNotAllowed
            | Code::SizeExceedsMax
            | Code::KeyDisabled => StatusCode::FORBIDDEN,
            Code::NoKey | Code::NotFound => StatusCode::NOT_FOUND,
            Code::BadRequest => StatusCode::BAD_REQUEST,
            Code::Upstream => StatusCode::BAD_GATEWAY,
            Code::Internal => StatusCode::INTERNAL_SERVER_ERROR,
            Code::Unauthorized => StatusCode::UNAUTHORIZED,
        }
    }
}

#[derive(Debug, thiserror::Error)]
#[error("{code:?}: {message}")]
pub struct GatewayError {
    pub code: Code,
    pub message: String,
}

impl GatewayError {
    pub fn new(code: Code, message: impl Into<String>) -> Self {
        Self { code, message: message.into() }
    }
}

#[derive(Serialize)]
struct ErrorBody {
    code: &'static str,
    message: String,
}

impl IntoResponse for GatewayError {
    fn into_response(self) -> axum::response::Response {
        let body = ErrorBody { code: self.code.as_str(), message: self.message };
        (self.code.status(), Json(body)).into_response()
    }
}

impl From<anyhow::Error> for GatewayError {
    fn from(e: anyhow::Error) -> Self {
        GatewayError::new(Code::Internal, e.to_string())
    }
}

pub type Result<T> = std::result::Result<T, GatewayError>;
