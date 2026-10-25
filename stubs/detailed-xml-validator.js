/**
 * Stands in for `detailed-xml-validator` (see vite.config.ts). `fast-xml-validator` re-exports it
 * as `BusinessRulesValidator`, which the app never uses, and its XML parser builds Node `Buffer`s
 * as soon as it loads, which crashes the browser. Only `SyntaxValidator` is used.
 */
export default class BusinessRulesValidator {
  constructor() {
    throw new Error('BusinessRulesValidator is not bundled; use SyntaxValidator.')
  }
}
