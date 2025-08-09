import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GoogleAuth } from 'google-auth-library';
import { google } from 'googleapis';
import { z } from 'zod';
function getDefaultProjectId() {
    return process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
}
async function getAuth(scopes) {
    const auth = new GoogleAuth({ scopes });
    return auth.getClient();
}
async function getProject(scopes) {
    const auth = new GoogleAuth({ scopes });
    const projectFromEnv = getDefaultProjectId();
    if (projectFromEnv)
        return projectFromEnv;
    const project = await auth.getProjectId();
    if (!project)
        throw new Error('No default project found. Set GOOGLE_CLOUD_PROJECT or GCLOUD_PROJECT.');
    return project;
}
function jsonStringify(data) {
    return JSON.stringify(data, null, 2);
}
const mcp = new McpServer({ name: 'mcp-gcp', version: '0.1.0' });
// gcp.whoami
{
    const args = { includeScopes: z.boolean().optional() };
    mcp.tool('gcp.whoami', 'Show current ADC identity and default project.', args, async (_args) => {
        const auth = new GoogleAuth();
        const projectId = await auth.getProjectId().catch(() => undefined);
        const client = await auth.getClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tokenInfo = await client.getAccessToken();
        const scopes = client.scopes ?? undefined;
        return {
            content: [{ type: 'text', text: jsonStringify({ projectId, token: !!tokenInfo?.token, scopes }) }],
        };
    });
}
// gcp.projects.list
{
    const args = {
        pageSize: z.number().int().min(1).max(300).optional(),
        pageToken: z.string().optional(),
    };
    mcp.tool('gcp.projects.list', 'List projects using Cloud Resource Manager v3.', args, async (input) => {
        const authClient = await getAuth(['https://www.googleapis.com/auth/cloud-platform.read-only']);
        google.options({ auth: authClient });
        const crm = google.cloudresourcemanager('v3');
        const res = await crm.projects.list({ pageSize: input.pageSize, pageToken: input.pageToken });
        return { content: [{ type: 'text', text: jsonStringify(res.data) }] };
    });
}
// gcs.buckets.list
{
    const args = { projectId: z.string().optional() };
    mcp.tool('gcs.buckets.list', 'List GCS buckets in a project.', args, async (input) => {
        const project = input.projectId ?? (await getProject(['https://www.googleapis.com/auth/devstorage.read_only']));
        const authClient = await getAuth(['https://www.googleapis.com/auth/devstorage.read_only']);
        google.options({ auth: authClient });
        const storage = google.storage('v1');
        const res = await storage.buckets.list({ project });
        return { content: [{ type: 'text', text: jsonStringify(res.data) }] };
    });
}
// gcs.objects.list
{
    const args = {
        bucket: z.string(),
        prefix: z.string().optional(),
        maxResults: z.number().int().min(1).max(1000).optional(),
    };
    mcp.tool('gcs.objects.list', 'List objects in a GCS bucket.', args, async (input) => {
        const authClient = await getAuth(['https://www.googleapis.com/auth/devstorage.read_only']);
        google.options({ auth: authClient });
        const storage = google.storage('v1');
        const res = await storage.objects.list({ bucket: input.bucket, prefix: input.prefix, maxResults: input.maxResults });
        return { content: [{ type: 'text', text: jsonStringify(res.data) }] };
    });
}
// gcs.objects.download (small text)
{
    const args = { bucket: z.string(), object: z.string(), generation: z.string().optional() };
    mcp.tool('gcs.objects.download', 'Download a small text object from GCS (returns content inline).', args, async (input) => {
        const authClient = await getAuth(['https://www.googleapis.com/auth/devstorage.read_only']);
        google.options({ auth: authClient });
        const storage = google.storage('v1');
        const res = await storage.objects.get({ bucket: input.bucket, object: input.object, generation: input.generation, alt: 'media' });
        const data = res.data;
        let text;
        if (typeof data === 'string')
            text = data;
        else if (Buffer.isBuffer(data))
            text = data.toString('utf-8');
        else
            text = jsonStringify(data);
        return { content: [{ type: 'text', text }] };
    });
}
// secretmanager.secrets.access
{
    const args = { projectId: z.string().optional(), secretId: z.string(), version: z.string().optional().default('latest') };
    mcp.tool('secretmanager.secrets.access', 'Access a Secret Manager version payload as text (UTF-8).', args, async (input) => {
        const project = input.projectId ?? (await getProject(['https://www.googleapis.com/auth/cloud-platform.read-only']));
        const authClient = await getAuth(['https://www.googleapis.com/auth/cloud-platform.read-only']);
        google.options({ auth: authClient });
        const sm = google.secretmanager('v1');
        const name = `projects/${project}/secrets/${input.secretId}/versions/${input.version ?? 'latest'}`;
        const res = await sm.projects.secrets.versions.access({ name });
        const dataAny = res.data;
        const payload = (dataAny.payload && dataAny.payload.data) ? Buffer.from(dataAny.payload.data, 'base64').toString('utf-8') : '';
        return { content: [{ type: 'text', text: payload }] };
    });
}
// pubsub.topics.list
{
    const args = { projectId: z.string().optional(), pageSize: z.number().int().min(1).max(1000).optional(), pageToken: z.string().optional() };
    mcp.tool('pubsub.topics.list', 'List Pub/Sub topics in a project.', args, async (input) => {
        const project = input.projectId ?? (await getProject(['https://www.googleapis.com/auth/pubsub.readonly']));
        const authClient = await getAuth(['https://www.googleapis.com/auth/pubsub.readonly']);
        google.options({ auth: authClient });
        const pubsub = google.pubsub('v1');
        const res = await pubsub.projects.topics.list({ project: `projects/${project}`, pageSize: input.pageSize, pageToken: input.pageToken });
        return { content: [{ type: 'text', text: jsonStringify(res.data) }] };
    });
}
// pubsub.topics.publish
{
    const args = {
        projectId: z.string().optional(),
        topicId: z.string(),
        messages: z.array(z.object({ data: z.string().optional(), attributes: z.record(z.string()).optional() })).min(1),
    };
    mcp.tool('pubsub.topics.publish', 'Publish messages to a Pub/Sub topic. Data is base64-encoded from UTF-8.', args, async (input) => {
        const project = input.projectId ?? (await getProject(['https://www.googleapis.com/auth/pubsub']));
        const authClient = await getAuth(['https://www.googleapis.com/auth/pubsub']);
        google.options({ auth: authClient });
        const pubsub = google.pubsub('v1');
        const topic = `projects/${project}/topics/${input.topicId}`;
        const res = await pubsub.projects.topics.publish({
            topic,
            requestBody: {
                messages: input.messages.map((m) => ({
                    data: m.data ? Buffer.from(m.data, 'utf-8').toString('base64') : undefined,
                    attributes: m.attributes,
                })),
            },
        });
        return { content: [{ type: 'text', text: jsonStringify(res.data) }] };
    });
}
// run.services.list
{
    const args = { projectId: z.string().optional(), region: z.string().optional().default('us-central1') };
    mcp.tool('run.services.list', 'List Cloud Run services in a region.', args, async (input) => {
        const project = input.projectId ?? (await getProject(['https://www.googleapis.com/auth/cloud-platform.read-only']));
        const authClient = await getAuth(['https://www.googleapis.com/auth/cloud-platform.read-only']);
        google.options({ auth: authClient });
        const run = google.run('v2');
        const parent = `projects/${project}/locations/${input.region ?? 'us-central1'}`;
        const res = await run.projects.locations.services.list({ parent });
        return { content: [{ type: 'text', text: jsonStringify(res.data) }] };
    });
}
// compute.instances.list
{
    const args = { projectId: z.string().optional(), zone: z.string().optional() };
    mcp.tool('compute.instances.list', 'List Compute Engine instances. If zone omitted, lists aggregated.', args, async (input) => {
        const project = input.projectId ?? (await getProject(['https://www.googleapis.com/auth/compute.readonly']));
        const authClient = await getAuth(['https://www.googleapis.com/auth/compute.readonly']);
        google.options({ auth: authClient });
        const compute = google.compute('v1');
        if (input.zone) {
            const res = await compute.instances.list({ project, zone: input.zone });
            return { content: [{ type: 'text', text: jsonStringify(res.data) }] };
        }
        const res = await compute.instances.aggregatedList({ project });
        return { content: [{ type: 'text', text: jsonStringify(res.data) }] };
    });
}
// gapi.request (generic)
{
    const args = {
        api: z.string(),
        version: z.string(),
        method: z.string(),
        parameters: z.record(z.any()).optional().default({}),
        scopes: z.array(z.string()).optional().default(['https://www.googleapis.com/auth/cloud-platform.read-only']),
    };
    mcp.tool('gapi.request', 'Generic Google API call via discovery clients.', args, async (input) => {
        const authClient = await getAuth(input.scopes ?? ['https://www.googleapis.com/auth/cloud-platform.read-only']);
        google.options({ auth: authClient });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const service = google[input.api]?.call(google, input.version);
        if (!service)
            throw new Error(`Unknown API ${input.api} ${input.version}`);
        const segments = input.method.split('.');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let target = service;
        for (let i = 0; i < segments.length - 1; i++) {
            target = target[segments[i]];
            if (!target)
                throw new Error(`Invalid method path at ${segments.slice(0, i + 1).join('.')}`);
        }
        const fn = target[segments[segments.length - 1]];
        if (typeof fn !== 'function')
            throw new Error('Final method is not callable');
        const res = await fn({ ...(input.parameters ?? {}) });
        return { content: [{ type: 'text', text: jsonStringify(res.data) }] };
    });
}
const transport = new StdioServerTransport();
await mcp.connect(transport);
