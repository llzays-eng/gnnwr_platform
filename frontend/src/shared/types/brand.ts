/**
 * 品牌类型基建。
 *
 * 运行时零开销 —— Brand<string,'ProjectId'> 编译后就是 string。
 * 用途是让 "把 datasetId 传进要 projectId 的位置" 变成编译错误。
 * 本项目里有 6 种 id 在到处传递, 裸 string 迟早会串。
 */
declare const BRAND: unique symbol;

export type Brand<T, B extends string> = T & { readonly [BRAND]: B };

export type ProjectId = Brand<string, 'ProjectId'>;
export type DatasetId = Brand<string, 'DatasetId'>;
export type TaskId = Brand<string, 'TaskId'>;
export type UserId = Brand<string, 'UserId'>;
export type FeatureId = Brand<string, 'FeatureId'>;
export type UploadId = Brand<string, 'UploadId'>;

/** 唯一的 id 构造入口。从接口响应反序列化时统一经过它, 便于日后加校验。 */
export const asId = <B extends Brand<string, string>>(raw: string): B => raw as B;

/** ISO-8601 时间字符串。约定: 传输层用它, 内存与运算一律用 epoch 毫秒。 */
export type IsoDateTime = Brand<string, 'IsoDateTime'>;
export const asIso = (raw: string): IsoDateTime => raw as IsoDateTime;
