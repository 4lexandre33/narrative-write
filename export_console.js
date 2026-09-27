window.save = (data, filename = 'dump.json') => {
  const str = typeof data === 'string' ? data : JSON.stringify(data, (k, v) => {
    if (typeof v === 'function') return '[Function]';
    if (typeof v === 'symbol') return '[Symbol]';
    return v;
  }, 2);
  const blob = new Blob([str], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

window.copyAny = (data) => {
  const str = typeof data === 'string' ? data : JSON.stringify(data, (k, v) => {
    if (typeof v === 'function') return '[Function]';
    if (typeof v === 'symbol') return '[Symbol]';
    return v;
  }, 2);
  navigator.clipboard.writeText(str).then(
    () => console.log(`📋 ${str.length} bytes copiados`),
    (err) => console.error('Falha ao copiar:', err)
  );
};