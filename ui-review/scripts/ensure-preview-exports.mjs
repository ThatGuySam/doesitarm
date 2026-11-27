import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

function exportsDefault(statement) {
  return statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword)
    || (ts.isExportAssignment(statement) && !statement.isExportEquals)
    || (ts.isExportDeclaration(statement) && statement.exportClause
      && ts.isNamedExports(statement.exportClause)
      && statement.exportClause.elements.some(element => element.name.text === 'default'))
}

function exportedNames(statement) {
  if (!statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) return []
  if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
    return statement.name ? [statement.name.text] : []
  }
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.map(({ name }) => name.getText())
  }
  return []
}

const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url))
const paths = new Set(JSON.parse(readFileSync(0, 'utf8')))
for (const path of paths) {
  const file = join(sourceRoot, path)
  const text = readFileSync(file, 'utf8')
  const { statements } = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  if (statements.some(exportsDefault)) continue
  const component = statements.flatMap(exportedNames).find(name => /^[A-Z]\w*$/.test(name))
  if (!component) throw new Error(`No component export in ${path}`)
  writeFileSync(file, `${text.trimEnd()}\n\nexport default ${component}\n`)
}
