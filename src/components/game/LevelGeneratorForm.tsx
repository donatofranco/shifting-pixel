// @ts-nocheck
// TODO: Fix TS errors
"use client";

import type { FC } from 'react';
import { useState } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { handleGenerateLevelAction } from '@/app/actions';
import type { GenerateLevelInput, GenerateLevelOutput } from '@/ai/flows/generate-level';
import { Loader2 } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";


const formSchema = z.object({
  difficulty: z.enum(['easy', 'medium', 'hard']),
  levelLength: z.coerce.number().int().min(50).max(200),
  platformDensity: z.enum(['sparse', 'normal', 'dense']),
  obstacleDensity: z.enum(['low', 'medium', 'high']),
});

type LevelGeneratorFormValues = z.infer<typeof formSchema>;

interface LevelGeneratorFormProps {
  onLevelGenerated: (data: GenerateLevelOutput) => void;
  setIsLoadingLevel: (isLoading: boolean) => void;
}

const LevelGeneratorForm: FC<LevelGeneratorFormProps> = ({ onLevelGenerated, setIsLoadingLevel }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const form = useForm<LevelGeneratorFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      difficulty: 'medium',
      levelLength: 100,
      platformDensity: 'normal',
      obstacleDensity: 'medium',
    },
  });

  const onSubmit: SubmitHandler<LevelGeneratorFormValues> = async (values) => {
    setIsSubmitting(true);
    setIsLoadingLevel(true);
    try {
      const result = await handleGenerateLevelAction(values as GenerateLevelInput);
      if ('error' in result) {
        console.error("Generation error:", result.error);
        toast({
          variant: "destructive",
          title: "Level Generation Failed",
          description: result.error || "An unknown error occurred.",
        });
      } else {
        onLevelGenerated(result);
        toast({
          title: "Level Generated!",
          description: "The new level is ready for preview.",
        });
      }
    } catch (error) {
      console.error("Unexpected error submitting form:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "An unexpected error occurred while generating the level.",
      });
    } finally {
      setIsSubmitting(false);
      setIsLoadingLevel(false);
    }
  };

  return (
    <Card className="border-accent shadow-lg bg-card/80 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-accent uppercase text-xl tracking-wider">Level Generator</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="difficulty"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground/80">Difficulty</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-input border-border focus:ring-ring">
                        <SelectValue placeholder="Select difficulty" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-popover border-border">
                      <SelectItem value="easy">Easy</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="hard">Hard</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="levelLength"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground/80">Level Length (Platforms)</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} className="bg-input border-border focus:ring-ring" />
                  </FormControl>
                  <FormDescription className="text-muted-foreground">
                    Number of platforms (50-200)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="platformDensity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground/80">Platform Density</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-input border-border focus:ring-ring">
                        <SelectValue placeholder="Select platform density" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-popover border-border">
                      <SelectItem value="sparse">Sparse</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="dense">Dense</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="obstacleDensity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground/80">Obstacle Density</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-input border-border focus:ring-ring">
                        <SelectValue placeholder="Select obstacle density" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-popover border-border">
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground uppercase tracking-wider text-lg py-3" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Generating...
                </>
              ) : (
                'Generate Level'
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};

export default LevelGeneratorForm;
