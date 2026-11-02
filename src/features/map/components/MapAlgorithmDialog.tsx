'use client'

import { Lock, Mountain, Waves, Wind, Sprout } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface MapAlgorithmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const STEPS = [
  {
    icon: Mountain,
    title: '高程',
    text: 'Voronoi 板块种子 + 运动向量；汇聚边界抬升山脉与高原，离散边界形成裂谷，海洋板块俯冲带只做轻微海沟。高程由板块基准、domain-warped Simplex 与 ridged noise 叠加，避免直线接缝。',
  },
  {
    icon: Waves,
    title: '水文',
    text: 'Priority-Flood 填平洼地；普通坡面按真实高程找下坡，洼地内部按蓄水面找出口。湖泊同时要求面积、水深、汇水补给且不直接临海，避免随机水坑。',
  },
  {
    icon: Wind,
    title: '气候',
    text: '纬向温度梯度 → 海拔递减 → 海陆热力差；盛行风带把水汽从海洋带入内陆，迎风坡抬升降雨、背风坡形成雨影。',
  },
  {
    icon: Sprout,
    title: '生物群系',
    text: '温度 × 湿度 Whittaker 查表，叠加海岸、湿地与高山修正，得到 16 类离散群系。',
  },
]

export function MapAlgorithmDialog({ open, onOpenChange }: MapAlgorithmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[82vh] max-w-xl overflow-y-auto p-6">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg">地图生成管线</DialogTitle>
          <DialogDescription className="text-ink-muted">
            512–4096 px · 纯 TypeScript · Web Worker · 固定种子可复现
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 flex flex-col gap-3">
          {STEPS.map((step) => (
            <div key={step.title} className="flex gap-3 rounded border border-line bg-paper-card/50 p-3">
              <step.icon size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-ink-muted" />
              <div>
                <p className="text-sm text-ink">{step.title}</p>
                <p className="mt-1 text-[11px] leading-5 text-ink-muted">{step.text}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded border border-line p-3 text-[11px] leading-5 text-ink-muted">
          <p className="text-ink">确定性与隐私</p>
          <p>
            同一 seed + 同一组参数，在任何机器上都会得到同一张地图。高程、温度、湿度、生物群系与所有视图均在本地计算，
            不请求任何在线地形、气候或瓦片服务。地图参数和种子写入本地 IndexedDB，并随 JSON / ZIP 备份导出。
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-ink-faint">
            <Lock size={12} strokeWidth={2} />
            运行时网络请求数：0
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
