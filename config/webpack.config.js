const path = require("path");
const webpack = require("webpack"); // ← added for DefinePlugin
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");

const rootPath = process.cwd();
const distPath = path.join(rootPath, "dist");
const srcPath = path.join(rootPath, "src");
// web4dvResource.js expects CODEC files at PUBLIC_PATH + "web4dv/CODEC.*"
// They live at src/lib/web4dv/ and must be served/copied to dist/web4dv/.
const web4dvSrc = path.join(srcPath, "lib", "web4dv");
const web4dvDist = path.join(distPath, "web4dv");

const ATTRIBUTES_TO_EXPAND = [
  "src",
  "gltf-model",
  "cover-image-url",
  "footer-image-url",
  "watermark-image-url",
];

const makeJsLoader = () => ({
  test: /\.js$/,
  use: {
    loader: "babel-loader",
    options: {
      presets: ["@babel/preset-env"],
      plugins: ["@babel/plugin-transform-runtime"],
    },
  },
  exclude: /node_modules/,
});

const makeCssLoader = () => ({
  test: /\.css$/,
  exclude: /\/assets\//,
  use: ["style-loader", "css-loader"],
});

const makeAssetLoader = () => ({
  test: /\..*$/,
  include: [path.join(srcPath, "assets")],
  loader: path.join(__dirname, "asset-loader.js"),
});

const makeDefaultHtmlLoader = () => ({
  test: /\.html$/,
  use: {
    loader: "html-loader",
    options: {
      esModule: false,
      sources: {
        list: [
          "...",
          {
            tag: "script",
            attribute: "src",
            type: "src",
            filter: () => false,
          },
          ...ATTRIBUTES_TO_EXPAND.map((attr) => ({
            tag: "*",
            attribute: attr,
            type: "src",
          })),
        ],
      },
    },
  },
});

const config = {
  entry: path.join(srcPath, "app.js"),
  output: {
    filename: "bundle.js",
    path: distPath,
    publicPath: "/",
  },
  plugins: [
    // ── Fix "process is not defined" in web4dvResource.js ───────────────────
    // web4dvResource uses `process.env.PUBLIC_PATH` to build the CODEC URLs
    // inside the web worker. DefinePlugin replaces it at bundle time so the
    // browser never sees a reference to Node's `process` object.
    // Must match output.publicPath above.
    new webpack.DefinePlugin({
      "process.env.PUBLIC_PATH": JSON.stringify("/"),
    }),

    new HtmlWebpackPlugin({
      template: path.join(srcPath, "index.html"),
      filename: "index.html",
      inject: false,
    }),

    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.join(rootPath, "external"),
          to: path.join(distPath, "external"),
          noErrorOnMissing: true,
        },
        {
          from: path.join(srcPath, "assets"),
          to: path.join(distPath, "assets"),
          noErrorOnMissing: true,
        },
        {
          from: path.join(rootPath, "image-targets"),
          to: path.join(distPath, "image-targets"),
          noErrorOnMissing: true,
        },
        // ── Copy CODEC binaries to dist/web4dv/ for production builds ────────
        // In dev mode these are served directly via devServer.static below.
        {
          from: web4dvSrc,
          to: web4dvDist,
          noErrorOnMissing: true,
        },
      ],
    }),
  ],

  resolve: { extensions: [".js"] },

  module: {
    rules: [
      makeJsLoader(),
      makeCssLoader(),
      makeAssetLoader(),
      makeDefaultHtmlLoader(),
    ],
  },

  mode: "production",
  context: srcPath,

  devServer: {
    open: false,
    compress: true,
    hot: true,
    liveReload: false,
    allowedHosts: [".ngrok-free.dev"],

    // ── Serve CODEC binaries at /web4dv/ in dev mode ────────────────────────
    // webpack-dev-server keeps CopyWebpackPlugin output in memory; the worker
    // fetches these files via importScripts so they must be on a real URL.
    // devServer.static serves them straight from disk at the matching path.
    static: [
      {
        directory: web4dvSrc,
        publicPath: "/web4dv",
      },
    ],

    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
      "Access-Control-Allow-Headers":
        "X-Requested-With, content-type, Authorization",
    },
    client: {
      overlay: {
        warnings: false,
        errors: true,
      },
    },
  },
};

module.exports = config;
