interface CategorySidebarProps {
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
}

const CATEGORIES = [
  { id: 'all', name: 'All Documents', icon: '📚' },
  { id: 'zeon', name: 'Zeon / Agritech', icon: '🌾' },
  { id: 'ai-ml', name: 'AI & ML Research', icon: '🤖' },
  { id: 'infra', name: 'Infrastructure & DevOps', icon: '⚙️' },
  { id: 'trading', name: 'Trading & Finance', icon: '📈' },
  { id: 'competitors', name: 'Competitors', icon: '🔍' },
];

export const CategorySidebar = ({ selectedCategory, onSelectCategory }: CategorySidebarProps) => {
  return (
    <div className="w-64 bg-foreman-bg-medium border-r border-foreman-border p-4">
      <h2 className="font-mono text-sm text-foreman-orange mb-4">Categories</h2>
      <div className="space-y-1">
        {CATEGORIES.map((category) => (
          <button
            key={category.id}
            onClick={() => onSelectCategory(category.name)}
            className={`w-full text-left px-3 py-2 font-sans text-sm transition-colors ${
              selectedCategory === category.name
                ? 'bg-foreman-orange text-white'
                : 'text-foreman-text hover:bg-foreman-bg-deep'
            }`}
          >
            <span className="mr-2">{category.icon}</span>
            {category.name}
          </button>
        ))}
      </div>
    </div>
  );
};

