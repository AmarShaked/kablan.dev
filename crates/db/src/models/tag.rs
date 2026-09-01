use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct Tag {
    pub id: Uuid,
    /// The project this tag belongs to. None means it is available in every project.
    pub project_id: Option<Uuid>,
    pub tag_name: String,
    pub content: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateTag {
    #[serde(default)]
    pub project_id: Option<Uuid>,
    pub tag_name: String,
    pub content: String,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateTag {
    pub tag_name: Option<String>,
    pub content: Option<String>,
}

impl Tag {
    /// The tags usable in a project: its own, plus the ones that belong to no project.
    ///
    /// Global tags come second so a project's own names win the eye when both exist.
    pub async fn find_for_project(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Tag,
            r#"SELECT id as "id!: Uuid", project_id as "project_id: Uuid", tag_name, content as "content!", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
               FROM tags
               WHERE project_id = $1 OR project_id IS NULL
               ORDER BY project_id IS NULL, tag_name ASC"#,
            project_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_all(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Tag,
            r#"SELECT id as "id!: Uuid", project_id as "project_id: Uuid", tag_name, content as "content!", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
               FROM tags
               ORDER BY tag_name ASC"#
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Tag,
            r#"SELECT id as "id!: Uuid", project_id as "project_id: Uuid", tag_name, content as "content!", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
               FROM tags
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn create(pool: &SqlitePool, data: &CreateTag) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        sqlx::query_as!(
            Tag,
            r#"INSERT INTO tags (id, project_id, tag_name, content)
               VALUES ($1, $2, $3, $4)
               RETURNING id as "id!: Uuid", project_id as "project_id: Uuid", tag_name, content as "content!", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            data.project_id,
            data.tag_name,
            data.content
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        data: &UpdateTag,
    ) -> Result<Self, sqlx::Error> {
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let tag_name = data.tag_name.as_ref().unwrap_or(&existing.tag_name);
        let content = data.content.as_ref().unwrap_or(&existing.content);

        sqlx::query_as!(
            Tag,
            r#"UPDATE tags
               SET tag_name = $2, content = $3, updated_at = datetime('now', 'subsec')
               WHERE id = $1
               RETURNING id as "id!: Uuid", project_id as "project_id: Uuid", tag_name, content as "content!", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            tag_name,
            content
        )
        .fetch_one(pool)
        .await
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM tags WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}
