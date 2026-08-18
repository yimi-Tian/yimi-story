export function generateJsonStaticFallback({ sourcePath, globalName, data }) {
  return `// Generated from ${sourcePath}. Do not edit by hand.\nwindow.${globalName} = ${JSON.stringify(data, null, 2)};\n`;
}

export function generateCsvStaticFallback(csvText) {
  return `window.ACTIVITIES_CSV = ${JSON.stringify(String(csvText))};\n`;
}
