export function analyzeVisualPolicy({video = {}, scenes = []}) {
  const forbidden = scenes.filter(s => String(s.visual || '').startsWith('paper-') || s.paperItems !== undefined);
  const checks = [{name: 'Removed paper visuals are not used', passed: forbidden.length === 0 && video.visualStyle !== 'paper-collage', detail: forbidden.map(s => s.id)}];
  return {passed: checks.every(c => c.passed), style: video.visualStyle || 'content-driven', policyVersion: 2, paperSceneCount: forbidden.length, checks,
    policy: '纸纹、卷边、胶带和纸片拼贴已移除。旧分镜必须重新设计，不自动回退到其他模板。'};
}
