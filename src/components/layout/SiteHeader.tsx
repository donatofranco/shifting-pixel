import type { FC } from 'react';

interface SiteHeaderProps {
  title: string;
}

const SiteHeader: FC<SiteHeaderProps> = ({ title }) => {
  return (
    <header className="py-4 md:py-6 text-center border-b-2 border-primary shadow-md">
      <h1 className="text-3xl md:text-4xl font-bold text-primary uppercase tracking-widest">
        {title}
      </h1>
    </header>
  );
};

export default SiteHeader;
