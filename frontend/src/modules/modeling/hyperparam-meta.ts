import type { ActivationFn } from '@shared/types';

/**
 * 每个超参数配一句人话与推荐值。
 *
 * 目标用户是规划师和地理研究生 —— 他们看得懂 R² 和残差,
 * 但没义务知道 dropout 的工程含义。这份元数据是向导文案的
 * 唯一来源, 不允许在组件里另写一份。
 */
export const NETWORK_META = {
  hidden_layers: {
    label: '隐藏层',
    plain: '空间权重网络的深度。层数越多能表达越复杂的空间关系，但更容易过拟合，也更慢。',
    recommended: '64 / 32 / 16（三层递减）',
  },
  activation: {
    label: '激活函数',
    plain: '决定网络如何处理非线性关系。不确定就用 ReLU，它在绝大多数情况下都工作良好。',
    recommended: 'relu',
  },
  dropout: {
    label: 'Dropout',
    plain: '训练时随机丢弃一部分神经元，防止模型死记硬背训练数据。样本少时调大一些。',
    recommended: 0.1,
  },
} as const;

export const TRAINING_META = {
  batch_size: {
    label: '批大小',
    plain: '每次喂给模型多少条样本。越大越稳但越吃内存；数据量小于一万时用 128 就够。',
    recommended: 256,
  },
  max_epochs: {
    label: '最大轮数',
    plain: '最多把全部数据过多少遍。配合早停使用，通常跑不满就会自动停。',
    recommended: 500,
  },
  learning_rate: {
    label: '学习率',
    plain: '每一步调整参数的幅度。太大会震荡不收敛，太小会训练很久。',
    recommended: 0.001,
  },
  early_stopping_patience: {
    label: '早停耐心值',
    plain: '验证集连续多少轮没有改善就提前停止，避免白跑和过拟合。',
    recommended: 30,
  },
} as const;

export const ACTIVATION_OPTIONS: { value: ActivationFn; label: string; plain: string }[] = [
  { value: 'relu', label: 'ReLU', plain: '默认选择，计算快、表现稳定。' },
  { value: 'leaky_relu', label: 'Leaky ReLU', plain: 'ReLU 的改良版，缓解神经元「死亡」问题。' },
  { value: 'tanh', label: 'Tanh', plain: '输出在 -1 到 1 之间，适合系数正负都重要的场景。' },
  { value: 'sigmoid', label: 'Sigmoid', plain: '输出在 0 到 1 之间，现在较少用于隐藏层。' },
  { value: 'elu', label: 'ELU', plain: '收敛通常更快，代价是计算稍慢。' },
];

/** 推荐配置一键填充 */
export const RECOMMENDED = {
  hidden_layers: [64, 32, 16],
  activation: 'relu' as ActivationFn,
  dropout: 0.1,
  batch_size: 256,
  max_epochs: 500,
  learning_rate: 0.001,
  early_stopping_patience: 30,
};
