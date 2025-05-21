import type { FC } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MoveRight, CornerLeftUp, CornerRightDown } from 'lucide-react'; // Removed Smartphone for now

const ControlsGuide: FC = () => {
  const controlItemClass = "flex items-center space-x-2 text-foreground/90 text-sm"; // Slightly larger text for readability
  const keyClass = "px-1.5 py-0.5 bg-input border border-border rounded-sm text-accent font-mono text-xs";

  return (
    <Card className="border-primary/50 shadow-sm bg-transparent border-none">
      <CardHeader className="p-0 pb-2">
        <CardTitle className="text-primary uppercase text-base tracking-wider text-center">Controls</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 p-0">
        <div className={controlItemClass}>
          <MoveRight className="w-4 h-4 text-primary" />
          <span>Run Left/Right:</span>
          <span className={keyClass}>A</span> / <span className={keyClass}>D</span> or <span className={keyClass}>←</span> / <span className={keyClass}>→</span>
        </div>
        <div className={controlItemClass}>
          <CornerLeftUp className="w-4 h-4 text-primary" />
          <span>Jump:</span>
          <span className={keyClass}>W</span> / <span className={keyClass}>↑</span> / <span className={keyClass}>SPACE</span>
        </div>
        <div className={controlItemClass}>
          <CornerRightDown className="w-4 h-4 text-primary" />
          <span>Crouch:</span>
          <span className={keyClass}>S</span> / <span className={keyClass}>↓</span>
        </div>
        {/* Removed touch controls section for brevity to avoid scroll
        <div className="pt-2 border-t border-border mt-3">
          <div className={controlItemClass}>
            <Smartphone className="w-5 h-5 text-primary" />
            <span className="text-muted-foreground">Touch controls available on mobile.</span>
          </div>
        </div>
        */}
      </CardContent>
    </Card>
  );
};

export default ControlsGuide;
