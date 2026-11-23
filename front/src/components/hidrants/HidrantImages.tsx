import React, { useState } from "react";
import type { HidrantImage } from "@/utils/hidrantDisplay";

interface HidrantImagesProps {
  images: HidrantImage[];
}

const SingleImage: React.FC<{ img: HidrantImage; index: number }> = ({ img, index }) => {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return null;
  }

  return (
    <a href={img.url} target="_blank" rel="noopener noreferrer" className="block h-20 mb-1 w-fit">
      <img
        src={img.thumbnail}
        alt={`Hidrant ${index + 1}`}
        className="h-20 w-auto max-w-30 object-contain rounded-md block"
        onError={() => setHasError(true)}
      />
    </a>
  );
};

export const HidrantImages: React.FC<HidrantImagesProps> = ({ images }) => {
  if (!images || images.length === 0) {
    return null;
  }

  const displayImages = images.slice(0, 3);

  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      {displayImages.map((img, index) => (
        <SingleImage key={index} img={img} index={index} />
      ))}
    </div>
  );
};
