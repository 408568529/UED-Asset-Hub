# UED Asset Hub Data Template

This folder is only an initialization template.

Real runtime data should be stored in `DATA_DIR`, outside the Git checkout on the host machine.

Recommended host layout:

```txt
D:/UED-Asset-Hub-Host/UED-Asset-Hub/   code checkout
D:/UED-Asset-Hub/data/                 runtime data, not tracked by Git
D:/UED-Asset-Hub/training-media/       server-local training videos
```

Copy this folder's contents into the host `DATA_DIR` only when bootstrapping a fresh server.

Set `TEST_ENV_ENCRYPTION_KEY` before creating test-environment records. Keep that secret stable and outside Git.

Training uses `training-groups.json` as the folder index. `training-topics.json` is kept only for old-data compatibility; new videos no longer create a topic level.
