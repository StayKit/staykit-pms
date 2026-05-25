// The StayKit glyph: shelter roofline + S monogram with a terracotta accent.
// Designed to sit inside a `.mark` teal chip (the chip provides the background);
// the source SVGs live in /public/brand. Sized via the `.brand-glyph` CSS rule.
export function BrandGlyph({ className = "brand-glyph" }: Readonly<{ className?: string }>) {
  return (
    <svg className={className} viewBox="355 329 558 558" aria-hidden="true" focusable="false">
      <path
        fill="#FAFAF7"
        d="M 438 632 L 442 640 L 465 660 L 497 675 L 524 680 L 733 680 L 754 688 L 768 704 L 772 717 L 771 734 L 763 751 L 752 761 L 737 767 L 456 768 L 448 776 L 448 835 L 452 841 L 459 844 L 737 844 L 752 842 L 780 833 L 809 814 L 827 794 L 843 762 L 849 735 L 849 710 L 843 682 L 834 662 L 820 642 L 803 626 L 775 610 L 760 605 L 735 601 L 541 601 L 524 595 L 511 580 L 508 580 Z"
      />
      <path
        fill="#FAFAF7"
        d="M 390 556 L 391 612 L 397 618 L 404 618 L 625 450 L 637 448 L 862 615 L 874 614 L 878 606 L 878 555 L 875 547 L 647 375 L 635 371 L 624 372 L 614 377 L 397 544 Z"
      />
      <path
        fill="#E07A5F"
        d="M 760 402 L 755 410 L 756 429 L 813 473 L 818 473 L 821 470 L 820 406 L 814 401 Z"
      />
    </svg>
  );
}
