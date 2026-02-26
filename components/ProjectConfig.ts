// A map of color names to Tailwind CSS classes. This ensures the full class names are present in the source
// and are not purged by Tailwind's build process.
export const colorClassMap: { [key: string]: { bg: string; text: string; border: string } } = {
    sky:    { bg: 'bg-sky-500',    text: 'text-sky-500',    border: 'border-sky-500' },
    green:  { bg: 'bg-green-500',  text: 'text-green-500',  border: 'border-green-500' },
    yellow: { bg: 'bg-yellow-500', text: 'text-yellow-500', border: 'border-yellow-500' },
    red:    { bg: 'bg-red-500',    text: 'text-red-500',    border: 'border-red-500' },
    purple: { bg: 'bg-purple-500', text: 'text-purple-500', border: 'border-purple-500' },
    pink:   { bg: 'bg-pink-500',   text: 'text-pink-500',   border: 'border-pink-500' },
    indigo: { bg: 'bg-indigo-500', text: 'text-indigo-500', border: 'border-indigo-500' },
    teal:   { bg: 'bg-teal-500',   text: 'text-teal-500',   border: 'border-teal-500' },
};
export const PROJECT_COLORS = Object.keys(colorClassMap);
