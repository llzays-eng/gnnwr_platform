"""
GeoServer 联动（大纲 4.2 · GeoServer 联动服务）
=============================================
训练完成后，把空间连续反演结果（栅格/曲面）发布为 WMS 图层，并按数值分级
动态生成 SLD 样式供前端调用。这里给出与 GeoServer REST API 对接的完整封装，
一期若暂不接 GeoServer，可只用前端 Loca 直接渲染逐点系数（见前端看板）。
"""
from __future__ import annotations

import requests

from app.core.config import settings


class GeoServerService:
    def __init__(self) -> None:
        self.base = settings.GEOSERVER_URL.rstrip("/")
        self.auth = (settings.GEOSERVER_USER, settings.GEOSERVER_PASSWORD)
        self.ws = settings.GEOSERVER_WORKSPACE

    def ensure_workspace(self) -> None:
        url = f"{self.base}/rest/workspaces"
        r = requests.get(f"{url}/{self.ws}", auth=self.auth, timeout=10)
        if r.status_code == 404:
            requests.post(url, json={"workspace": {"name": self.ws}}, auth=self.auth, timeout=10)

    def publish_geotiff(self, store: str, geotiff_path: str) -> str:
        """把一张反演结果 GeoTIFF 发布为 coverage，返回 WMS 图层名。"""
        self.ensure_workspace()
        url = f"{self.base}/rest/workspaces/{self.ws}/coveragestores/{store}/file.geotiff"
        with open(geotiff_path, "rb") as f:
            requests.put(url, data=f, headers={"Content-type": "image/tiff"},
                         auth=self.auth, timeout=60)
        return f"{self.ws}:{store}"

    def build_sld(self, layer: str, attribute: str, breaks: list[float],
                  colors: list[str]) -> str:
        """按数值分级生成 SLD（分位数/自然断点由调用方给出 breaks）。"""
        rules = []
        for i in range(len(breaks) - 1):
            rules.append(f"""
      <Rule>
        <ogc:Filter><ogc:PropertyIsBetween>
          <ogc:PropertyName>{attribute}</ogc:PropertyName>
          <ogc:LowerBoundary><ogc:Literal>{breaks[i]}</ogc:Literal></ogc:LowerBoundary>
          <ogc:UpperBoundary><ogc:Literal>{breaks[i+1]}</ogc:Literal></ogc:UpperBoundary>
        </ogc:PropertyIsBetween></ogc:Filter>
        <PolygonSymbolizer><Fill>
          <CssParameter name="fill">{colors[i]}</CssParameter>
        </Fill></PolygonSymbolizer>
      </Rule>""")
        return f"""<?xml version="1.0" encoding="UTF-8"?>
<StyledLayerDescriptor version="1.0.0"
  xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc">
  <NamedLayer><Name>{layer}</Name><UserStyle><FeatureTypeStyle>
    {''.join(rules)}
  </FeatureTypeStyle></UserStyle></NamedLayer>
</StyledLayerDescriptor>"""

    def wms_url(self, layer: str) -> str:
        return f"{self.base}/{self.ws}/wms"


geoserver = GeoServerService()
