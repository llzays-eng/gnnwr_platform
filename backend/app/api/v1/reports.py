"""报告接口（大纲 4.2 · 报告生成服务）：汇总精度与基线对比，导出 PDF。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.model_task import ModelTask
from app.models.user import User

router = APIRouter(prefix="/reports", tags=["reports"])


def _render_html(task: ModelTask) -> str:
    r = task.result
    baseline_rows = "".join(
        f"<tr><td>{b.method}</td><td>{b.r2}</td><td>{b.rmse}</td><td>{b.mae}</td></tr>"
        for b in task.baselines
    )
    return f"""<!doctype html><html><head><meta charset="utf-8">
<style>body{{font-family:sans-serif;margin:40px}}table{{border-collapse:collapse;width:100%}}
td,th{{border:1px solid #ccc;padding:6px 10px;text-align:left}}
h1{{color:#1f6feb}}</style></head><body>
<h1>GNNWR 时空智能分析 · 技术报告</h1>
<p>任务 ID：{task.id}　模型：{task.model_type}　目标变量：{task.y_column}</p>
<h2>主模型精度</h2>
<table><tr><th>R²</th><th>RMSE</th><th>MAE</th><th>AICc</th></tr>
<tr><td>{r.r2}</td><td>{r.rmse}</td><td>{r.mae}</td><td>{r.aicc}</td></tr></table>
<h2>与基线方法对比</h2>
<table><tr><th>方法</th><th>R²</th><th>RMSE</th><th>MAE</th></tr>{baseline_rows}</table>
<p style="color:#888;margin-top:30px">本报告由平台自动生成。逐点局部回归系数可在可视化看板查看。</p>
</body></html>"""


@router.get("/{task_id}/export")
def export_report(task_id: str, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    task = db.get(ModelTask, task_id)
    if not task or task.result is None:
        raise HTTPException(status_code=404, detail="结果不存在")
    html = _render_html(task)
    try:
        from weasyprint import HTML  # 生产环境安装 weasyprint 渲染 PDF
        pdf = HTML(string=html).write_pdf()
        return Response(content=pdf, media_type="application/pdf",
                        headers={"Content-Disposition":
                                 f'attachment; filename="report_{task_id}.pdf"'})
    except Exception:
        # 未装 weasyprint 时回退返回 HTML，功能不阻断
        return Response(content=html, media_type="text/html")
