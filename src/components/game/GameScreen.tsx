import type { FC } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const GameScreen: FC = () => {
  return (
    <Card className="border-primary shadow-lg bg-card/80 backdrop-blur-sm h-[400px] md:h-[500px] flex flex-col">
      <CardHeader>
        <CardTitle className="text-primary uppercase text-xl tracking-wider">Game Screen</CardTitle>
      </CardHeader>
      <CardContent className="flex-grow flex items-center justify-center">
        <div 
          className="w-full h-full bg-black/50 border-2 border-dashed border-muted-foreground rounded-sm flex items-center justify-center"
          aria-label="Game canvas placeholder"
        >
          <p className="text-muted-foreground text-center p-4">
            Pixel Jumper: The Shifting Labyrinth
            <br />
            <span className="text-sm">(PixiJS game will render here)</span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default GameScreen;
