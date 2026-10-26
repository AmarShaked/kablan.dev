use axum::{
    Json,
    body::Body,
    http::HeaderValue,
    response::{IntoResponse, Response},
};
use reqwest::{StatusCode, header};
use rust_embed::RustEmbed;
use utils::response::ApiResponse;

#[derive(RustEmbed)]
#[folder = "../../frontend/dist"]
pub struct Assets;

pub async fn serve_frontend(uri: axum::extract::Path<String>) -> Response {
    let path = uri.trim_start_matches('/');
    if is_api_path(path) {
        return api_not_found(path);
    }
    serve_file(path).await.into_response()
}

/// Axum flattens `nest("/api", ..)` into the outer router, so an `/api` path that
/// matches no route falls through to the SPA catch-all below. Answering those with
/// index.html makes a wrong API path look like a 200 returning unparseable data.
fn is_api_path(path: &str) -> bool {
    path == "api" || path.starts_with("api/")
}

fn api_not_found(path: &str) -> Response {
    (
        StatusCode::NOT_FOUND,
        Json(ApiResponse::<()>::error(&format!(
            "No API route matches /{path}"
        ))),
    )
        .into_response()
}

pub async fn serve_frontend_root() -> impl IntoResponse {
    serve_file("index.html").await
}

async fn serve_file(path: &str) -> impl IntoResponse + use<> {
    let file = Assets::get(path);

    match file {
        Some(content) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();

            Response::builder()
                .status(StatusCode::OK)
                .header(
                    header::CONTENT_TYPE,
                    HeaderValue::from_str(mime.as_ref()).unwrap(),
                )
                .body(Body::from(content.data.into_owned()))
                .unwrap()
        }
        None => {
            // For SPA routing, serve index.html for unknown routes
            if let Some(index) = Assets::get("index.html") {
                Response::builder()
                    .status(StatusCode::OK)
                    .header(header::CONTENT_TYPE, HeaderValue::from_static("text/html"))
                    .body(Body::from(index.data.into_owned()))
                    .unwrap()
            } else {
                Response::builder()
                    .status(StatusCode::NOT_FOUND)
                    .body(Body::from("404 Not Found"))
                    .unwrap()
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use axum::{body::to_bytes, extract::Path};

    use super::*;

    #[test]
    fn api_paths_are_recognised() {
        assert!(is_api_path("api"));
        assert!(is_api_path("api/execution-processes"));
        assert!(is_api_path("api/task-attempts/abc/execution-processes"));

        assert!(!is_api_path("apidocs"));
        assert!(!is_api_path("projects/abc/tasks"));
        assert!(!is_api_path("assets/index-abc123.js"));
    }

    #[tokio::test]
    async fn unknown_api_path_returns_json_404_not_the_spa() {
        let response = serve_frontend(Path(
            "api/task-attempts/abc/execution-processes".to_string(),
        ))
        .await;

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        assert_eq!(
            response
                .headers()
                .get(header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok()),
            Some("application/json")
        );

        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let body = String::from_utf8(body.to_vec()).unwrap();
        assert!(
            !body.contains("<!DOCTYPE html>"),
            "got the SPA bundle: {body}"
        );
        assert!(
            body.contains("\"success\":false"),
            "unexpected body: {body}"
        );
        assert!(
            body.contains("/api/task-attempts/abc/execution-processes"),
            "404 should name the path that missed: {body}"
        );
    }
}
