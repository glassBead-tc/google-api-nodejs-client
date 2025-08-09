# GCP MCP Server

An MCP server that exposes a curated set of Google Cloud tools via the Model Context Protocol, built on top of `googleapis` and `google-auth-library`.

## Features
- gcp.whoami: Shows ADC info and default project
- gcp.projects.list: List projects via Cloud Resource Manager v3
- gcs.buckets.list / gcs.objects.list: List GCS buckets and objects
- gcs.objects.download: Download small text objects as response content
- secretmanager.secrets.access: Access a secret version
- pubsub.topics.list / pubsub.topics.publish: List topics and publish messages
- run.services.list: List Cloud Run services
- compute.instances.list: List Compute Engine instances
- gapi.request: Generic Google API HTTP request using discovery-configured clients

## Auth
Uses Application Default Credentials (ADC). Locally, run:

```
gcloud auth application-default login
```

Or set `GOOGLE_APPLICATION_CREDENTIALS` to a service account JSON file path.

You can optionally set a default project via `GCLOUD_PROJECT` or `GOOGLE_CLOUD_PROJECT`.

## Install
```
cd mcp-gcp
npm install
npm run build
```

## Run
As an MCP server over stdio:
```
npm start
```

Or via your MCP-compatible client configuration, point to `node dist/server.js`.

## Environment variables
- GOOGLE_APPLICATION_CREDENTIALS: Path to a service account key file
- GOOGLE_CLOUD_PROJECT / GCLOUD_PROJECT: Default project ID when not provided

## Safety & limits
- This server defaults to read-mostly scopes. Mutating tools are limited to safe examples (e.g., Pub/Sub publish). Add more scopes or tools as needed.
- `gcs.objects.download` is intended for small text objects (<1MB). For large/binary payloads, prefer pre-signed URLs or stream to files.

## Development
```
npm run dev
```