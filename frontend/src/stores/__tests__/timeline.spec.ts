import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useTimelineStore } from '../timeline';

const DAY = 86_400_000;
const frames = Array.from({ length: 5 }, (_, i) => Date.UTC(2023, 6, 1) + i * DAY);

describe('时间轴状态机', () => {
  beforeEach(() => { setActivePinia(createPinia()); });

  it('无帧时不能播放', () => {
    const t = useTimelineStore();
    t.start();
    expect(t.play).toBe('stopped');
  });

  it('setFrames 会排序并复位', () => {
    const t = useTimelineStore();
    t.setFrames([...frames].reverse());
    expect(t.frames[0]).toBe(frames[0]);
    expect(t.index).toBe(0);
    expect(t.play).toBe('stopped');
  });

  it('playing ⇄ paused，stop 复位到第一帧', () => {
    const t = useTimelineStore();
    t.setFrames(frames);
    t.start(); expect(t.play).toBe('playing');
    t.toggle(); expect(t.play).toBe('paused');
    t.toggle(); expect(t.play).toBe('playing');
    t.seek(3);
    t.stop();
    expect(t.play).toBe('stopped');
    expect(t.index).toBe(0);
  });

  it('循环开启时到末尾回到开头', () => {
    const t = useTimelineStore();
    t.setFrames(frames);
    t.loop = true;
    t.seek(4);
    t.step(1);
    expect(t.index).toBe(0);
  });

  it('循环关闭时到末尾停住并停止播放', () => {
    const t = useTimelineStore();
    t.setFrames(frames);
    t.loop = false;
    t.start();
    t.seek(4);
    t.step(1);
    expect(t.index).toBe(4);
    expect(t.play).toBe('stopped');
  });

  it('seek 越界被夹紧', () => {
    const t = useTimelineStore();
    t.setFrames(frames);
    t.seek(99); expect(t.index).toBe(4);
    t.seek(-5); expect(t.index).toBe(0);
  });

  it('frameWindow 给出当前帧的时间区间', () => {
    const t = useTimelineStore();
    t.setFrames(frames);
    t.seek(1);
    expect(t.frameWindow![0]).toBe(frames[1]);
    expect(t.frameWindow![1]).toBe(frames[2]! - 1);
  });
});
