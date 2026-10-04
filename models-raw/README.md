# models-raw (local scratch, git-ignored)

Drop raw or uncompressed `.glb` exports from Blender here. Nothing in this
folder is committed to git except this README.

## Compress a model into the deployed asset

From the `client/` folder, run:

```
npm run compress:model -- ../models-raw/yourfile.glb
```

This optimizes the input (WebP textures, resize to 1024, Draco geometry) and
writes the result to `client/public/apartment.glb`, which is the file the app
loads and the only `.glb` that ships to production.

To change quality/size, pass a texture size, for example 1536:

```
npm run compress:model -- ../models-raw/yourfile.glb 1536
```
```
