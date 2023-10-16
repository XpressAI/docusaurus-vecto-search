# Docusaurus Vecto Search

Forked from [Docusaurus Search Local](https://github.com/easyops-cn/docusaurus-search-local).

## Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/XpressAI/docusaurus-vecto-search
   ```
2. Move into the directory and install dependencies:
   ```bash
   cd docusaurus-vecto-search
   yarn install
   ```

### Link the Project
3. Create a symbolic link for the project:
   ```bash
   yarn link
   ```

### Setting Up a New Docusaurus Website
4. In a different directory, create a new Docusaurus website (ensure you're using version 2.4.3 or newer). You can also use an existing Docusaurus website, but ensure it's a recent version.
   ```bash
   yarn create docusaurus my-website
   ```

5. Move into the Docusaurus project directory and install its dependencies:
   ```bash
   cd my-website
   yarn install
   ```

6. Build the Docusaurus project:
   ```bash
   yarn build
   ```

### Linking docusaurus-vecto-search
7. Link the previously linked `docusaurus-vecto-search` to this Docusaurus project:
   ```bash
   yarn link docusaurus-vecto-search
   ```

### Configuration
8. In your `docusaurus.config.js` file, add the following to the `themes` array:

```javascript
themes: [
      [
        "docusaurus-vecto-search",
        /** type {import("docusaurus-vecto-search").PluginOptions} */
        ({
          user_token: "",
          public_token: "",
          vector_space_id: 123,
          top_k: 123
        }),
      ],
]
```

9. Finally, build your Docusaurus website with the new search configuration:
   ```bash
   yarn build
   ```

That's it! Your Docusaurus website should now be set up with the `docusaurus-vecto-search` functionality.
