module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // scope 对齐功能域目录, 提交信息本身就是模块地图
    'scope-enum': [2, 'always', [
      'dataset', 'modeling', 'monitor', 'dashboard', 'project',
      'geo', 'api', 'mock', 'ui', 'build', 'types', 'docs',
    ]],
  },
};
