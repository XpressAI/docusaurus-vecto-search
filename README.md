<p align="center">
<a href="https://www.vecto.ai/">
<img src="https://user-images.githubusercontent.com/68586800/192857099-499146bb-5570-4702-a88f-bb4582e940c0.png" width="300"/>
</a>
</p>
<p align="center">
  <a href="https://docs.vecto.ai/">Docs</a> •
  <a href="https://www.xpress.ai/blog/">Blog</a> •
  <a href="https://discord.com/invite/wtYbXvPPfD">Discord</a> •
  <a href="https://github.com/XpressAI/vecto-tutorials">Tutorials</a>
</p>

<br>

# Docusaurus Vecto Search
Welcome to the Docusaurus Vecto Search repository! This plugin will provide a Vecto powered search for your Docusaurus website. 

<p align="center">
<img src="https://docs.vecto.ai/img/docs/integrations/docusaurus-vecto-search.png" width="80%"/>
</p>


## Setup

Ensure that you have a Docusaurus project ready which is at least 2.4.3 or higher. You may also generate a fresh one by:

```bash
npx create-docusaurus@latest my-website classic
```

or 
```bash
yarn create docusaurus my-website
```

Also ensure that you also have a Vecto token ready. You may request one [here](https://www.vecto.ai/contactus).


#### 1) Install Docusaurus Vecto Search Plugin

Navigate to the root of your Docusaurus project, then install via


```bash
npm install @xpressai/docusaurus-vecto-search
```

or


```bash
yarn add @xpressai/docusaurus-vecto-search
```

#### 2) Update Docusaurus Configuration
In your `docusaurus.config.js` file, add the following to the `themes` array:

```javascript
themes: [
      [
        "@xpressai/docusaurus-vecto-search",
        /** type {import("@xpressai/docusaurus-vecto-search").PluginOptions} */
        ({
          vecto_public_token: "",
          vector_space_id: 123,
          top_k: 15,
          rankBy: "weightedAverage" // recommended
        }),
      ],
]
```
Alternatively, you can also set your config to fetch Vecto vars from your ENV using `process.env`, ie `vecto_public_token = process.env.vecto_public_token`.
For the full list of configs, refer to the [configuration](#configuration-options) section.

#### 3) Add Vecto User Token To Environment Variables

You'll need to set the `VECTO_USER_TOKEN` environment variable for the `docusaurus-vecto-search` plugin to function properly. This token is private and is not exposed during the Docusaurus build process as it is not added in the docusaurus config.

##### a. For CI/CD (e.g., GitHub Actions)

If you are deploying your Docusaurus site using a CI/CD service like GitHub Actions, set `VECTO_USER_TOKEN` as an environment variable in your workflow configuration. You can use repository secrets to securely store the token.

##### b. For Local Development

For local development, you can export the `VECTO_USER_TOKEN` from your terminal:

```bash
export VECTO_USER_TOKEN=your_token_value_here
```

Alternatively, you can create a `.env` file in the root of your Docusaurus project and add the token there:

```
VECTO_USER_TOKEN=your_token_value_here
```

Using a .env file ensures that the token remains set between terminal sessions.

#### 4) Build!

Finally, build your Docusaurus website with the new search configuration:

```bash
npm run build
```

or 

```bash
yarn build
```


That's it! Your Docusaurus website should now be set up with the `docusaurus-vecto-search` functionality.

If you'd like to give it a try, we have implemented the search in the [vecto docs]([docs.vecto.ai](https://docs.vecto.ai/)) and at [Xircuits.io](https://xircuits.io/)!

### Configuration Options

The following are the parameters that you can adjust in your `docusaurus.config.js`.

| Option              | Type   | Description                                                         |
|---------------------|--------|---------------------------------------------------------------------|
| `vecto_public_token` | string | The public token for Vecto search authentication.                  |
| `vector_space_id`   | number | The ID of the vector space for search.                              |
| `top_k`             | number | Number of search results to return. Default: 10                     |
| `rankBy`            | string | Method for ranking and aggregating results. Optional                |

#### rankBy Options:
If not set, the default behavior is to return results sorted by highest similarity without any aggregation.
- `"averageByURL"`: Groups results by URL and averages similarity scores.
- `"countByURL"`: Groups results by URL, ranks by result count per URL.
- `"weightedAverageByURL"`: Groups results by URL, calculates weighted average of similarity scores.


### Local Plugin Development
If you would like to modify the current Vecto Search plugin, here are the steps:

1. Clone and install the repository:
   ```bash
   git clone https://github.com/XpressAI/docusaurus-vecto-search
   cd docusaurus-vecto-search
   yarn install
   ```
2. Create a symbolic link for the project:
   ```bash
   yarn link
   ```
3. In a different directory, create a new Docusaurus website (ensure you're using version 2.4.3 or newer).
   ```bash
   yarn create docusaurus my-website
   ```
   You can also use an existing Docusaurus project, but ensure it's a recent version.
 
4. Move into the Docusaurus project directory and install its dependencies:
   ```bash
   cd my-website
   yarn install
   ```
5. Link the previously linked `docusaurus-vecto-search` to this Docusaurus project:
   ```bash
   yarn link @xpressai/docusaurus-vecto-search
   ```
6. Build the Docusaurus project:
   ```bash
   yarn build
   ```

# Special Thanks
Forked from [Docusaurus Search Local](https://github.com/easyops-cn/docusaurus-search-local).

