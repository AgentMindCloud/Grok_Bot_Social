-- Runs only on first initialization of an empty PostgreSQL data volume.
-- psql quotes the environment-derived password as a SQL literal.
\getenv app_password GROKBOT_DB_PASSWORD
CREATE ROLE grokbot LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'app_password';
ALTER DATABASE grokbot OWNER TO grokbot;
REVOKE ALL ON DATABASE grokbot FROM PUBLIC;
