import {defineConfig} from "rollup";
import nodeResolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import {terser} from "rollup-plugin-terser";
import postcss from "rollup-plugin-postcss";
import atImport from "postcss-import";


export default defineConfig({
  input: 'src/index.js',
  output: {
    dir: 'dist',
    format: 'es',
    sourcemap: true,
    compact: true
  },
  plugins: [
    nodeResolve(),
    commonjs(),
    terser(),
    postcss({
      extract: true,
      minimize: true,
      plugins: [atImport()]
    })
  ]
})