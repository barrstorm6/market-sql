export function summary(checks) {
  return { automated: checks.reduce((s, c) => s + c.earned, 0),
    automatedMax: checks.reduce((s, c) => s + c.weight, 0),
    manualPending: checks.some(c => c.task === 8) ? 10 : 0, checks };
}

export function render(checks, format) {
  const result = summary(checks);
  if (format === 'json') return JSON.stringify(result, null, 2);
  const lines = [format === 'markdown' ? '# E-Commerce SQL Challenge' : 'E-Commerce SQL Challenge', ''];
  for (const id of [...new Set(checks.map(c => c.task))].sort((a,b) => a-b)) {
    const group = checks.filter(c => c.task === id);
    const {automated, automatedMax} = summary(group);
    lines.push((format === 'markdown' ? '## ' : '') + 'Задание ' + String(id).padStart(2, '0') + ' — ' + automated + '/' + automatedMax, '');
    for (const c of group) lines.push(`- ${c.name} [${c.earned}/${c.weight}] ${c.error ?? 'OK'}`);
    lines.push('');
  }
  lines.push(`Автоматически: ${result.automated}/${result.automatedMax}. Ручная оценка: до ${result.manualPending} баллов.`);
  return lines.join('\n');
}
