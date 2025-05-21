import type { FC } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MoveRight, CornerLeftUp, CornerRightDown, Smartphone } from 'lucide-react'; // Using lucide for simplicity

const ControlsGuide: FC = () => {
  const controlItemClass = "flex items-center space-x-2 text-foreground/90";
  const keyClass = "px-2 py-1 bg-input border border-border rounded-sm text-accent font-mono text-xs";

  return (
    <Card className="border-primary/50 shadow-lg bg-card/80 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-primary uppercase text-xl tracking-wider">Controls</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className={controlItemClass}>
          <MoveRight className="w-5 h-5 text-primary" />
          <span>Run Left/Right:</span>
          <span className={keyClass}>A</span> / <span className={keyClass}>D</span> or <span className={keyClass}>←</span> / <span className={keyClass}>→</span>
        </div>
        <div className={controlItemClass}>
          <CornerLeftUp className="w-5 h-5 text-primary" />
          <span>Jump:</span>
          <span className={keyClass}>W</span> or <span className={keyClass}>↑</span> or <span className={keyClass}>SPACE</span>
        </div>
        <div className={controlItemClass}>
          <CornerRightDown className="w-5 h-5 text-primary" />
          <span>Crouch:</span>
          <span className={keyClass}>S</span> or <span className={keyClass}>↓</span>
        </div>
        <div className="pt-2 border-t border-border mt-3">
          <div className={controlItemClass}>
            <Smartphone className="w-5 h-5 text-primary" />
            <span className="text-muted-foreground">Touch controls available on mobile.</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ControlsGuide;
