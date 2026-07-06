# UED Asset Hub Data Template

This folder is only an initialization template.

Real runtime data should be stored in `DATA_DIR`, outside the Git checkout on the host machine.

Recommended host layout:

```txt
D:/UED-Asset-Hub-Host/UED-Asset-Hub/   code checkout
D:/UED-Asset-Hub/data/                 runtime data, not tracked by Git
```

Copy this folder's contents into the host `DATA_DIR` only when bootstrapping a fresh server.
