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

# Setup
## 1) Install Plugin

Navigate to the root of your Docusaurus project, then install via
```
npm install @xpressai/docusaurus-vecto-search
```

### 2) Configuration
In your `docusaurus.config.js` file, add the following to the `themes` array:

```javascript
themes: [
      [
        "docusaurus-vecto-search",
        /** type {import("docusaurus-vecto-search").PluginOptions} */
        ({
          public_token: "",
          vector_space_id: 123,
          top_k: 123
        }),
      ],
]
```

For the token, sign up for your access [here](https://www.vecto.ai/contactus).

### 3) Add Environment Variables

Create a `.env` file in the root of your Docusaurus project.
   ```bash
   USER_TOKEN=your_token_value_here
   ```
This token will be utilized by the `docusaurus-vecto-search` for clearing and ingesting data. Unlike the `public_token`, the `USER_TOKEN` is private and should not be exposed.

### 4) Build!

Finally, build your Docusaurus website with the new search configuration:
   ```bash
   yarn build
   ```

That's it! Your Docusaurus website should now be set up with the `docusaurus-vecto-search` functionality.


## Local Plugin Development
If you would like to modify the current Vecto Search plugin, here are the steps:

1. Clone the repository:
   ```bash
   git clone https://github.com/XpressAI/docusaurus-vecto-search
   ```
2. Move into the directory and install dependencies:
   ```bash
   cd docusaurus-vecto-search
   yarn install
   ```
3. Create a symbolic link for the project:
   ```bash
   yarn link
   ```
4. In a different directory, create a new Docusaurus website (ensure you're using version 2.4.3 or newer).
   ```bash
   yarn create docusaurus my-website
   ```
   You can also use an existing Docusaurus project, but ensure it's a recent version.
 
5. Move into the Docusaurus project directory and install its dependencies:
   ```bash
   cd my-website
   yarn install
   ```
6. Link the previously linked `docusaurus-vecto-search` to this Docusaurus project:
   ```bash
   yarn link docusaurus-vecto-search
   ```
7. Build the Docusaurus project:
   ```bash
   yarn build
   ```


# Special Thanks
Forked from [Docusaurus Search Local](https://github.com/easyops-cn/docusaurus-search-local).

