/** 替换模板中的 {{变量名}} */
export function replaceVars(
  template: string,
  vars: Record<string, any>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = vars[key];
    return value !== undefined ? String(value) : match;
  });
}

/** 递归替换对象中的模板变量 */
export function replaceVarsInObj(
  obj: Record<string, string>,
  vars: Record<string, any>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, replaceVars(v, vars)]),
  );
}
