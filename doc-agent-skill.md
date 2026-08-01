> ## Documentation Index
> Fetch the complete documentation index at: https://docs.worldlabs.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# AI agent skill

> Install the World Labs API skill for coding agents

## Install the skill

The World Labs API skill gives coding agents API guidance and an OpenAPI
snapshot for client generation, world generation, media asset uploads, and
operation polling.

```bash theme={null}
npx skills add worldlabsai/marble-developer-api-skill --skill marble-developer-api
```

Install it globally if you want agents to use it across projects:

```bash theme={null}
npx skills add worldlabsai/marble-developer-api-skill --skill marble-developer-api --global
```

## Verify the install

List the skills exposed by the public mirror:

```bash theme={null}
npx skills add worldlabsai/marble-developer-api-skill --list
```

You should see `marble-developer-api` in the output.

## Use the skill

Ask your coding agent to invoke the skill by name:

```text theme={null}
Use the marble-developer-api skill to build a TypeScript client for World API v1.
```

```text theme={null}
Use the marble-developer-api skill to upload an image, generate a world, and poll the operation.
```

<Warning>
  Never paste a real API key into prompts, logs, screenshots, or committed files.
</Warning>

The skill source is mirrored at
[worldlabsai/marble-developer-api-skill](https://github.com/worldlabsai/marble-developer-api-skill).
