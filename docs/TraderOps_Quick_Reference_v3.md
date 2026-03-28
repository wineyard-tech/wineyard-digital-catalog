# TraderOps Quick Reference v3
**Developer Cheat Sheet | March 2026**

Fast lookup for developers implementing TraderOps across React, React Native, and Flutter.

---

## Color Tokens (Copy-Paste Ready)

### CSS Variables
```css
:root {
  /* Primary */
  --color-primary: #0066CC;
  --color-primary-dark: #0052A3;
  --color-cta: #059669;
  --color-cta-dark: #047857;
  
  /* Backgrounds */
  --color-bg: #F8FAFB;
  --color-surface: #FFFFFF;
  --color-surface-alt: #F1F5F9;
  
  /* Text */
  --color-text-primary: #0F172A;
  --color-text-secondary: #334155;
  --color-text-tertiary: #64748B;
  --color-text-disabled: #CBD5E1;
  
  /* Semantic */
  --color-success: #059669;
  --color-success-bg: #ECFDF5;
  --color-warning: #D97706;
  --color-warning-bg: #FFFBEB;
  --color-error: #DC2626;
  --color-disabled: #64748B;
  
  /* Borders */
  --color-border: #E2E8F0;
  --color-border-subtle: #F1F5F9;
}
```

### Tailwind Config
```javascript
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0066CC',
          dark: '#0052A3'
        },
        cta: {
          DEFAULT: '#059669',
          dark: '#047857'
        },
        text: {
          primary: '#0F172A',
          secondary: '#334155',
          tertiary: '#64748B',
          disabled: '#CBD5E1'
        }
      }
    }
  }
}
```

---

## Component Code Samples

### Product Card (v3)

**React + Tailwind:**
```jsx
function ProductCard({ product, quantity, onAdd, onRemove }) {
  return (
    <div className="relative bg-white rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
      {/* Top badge */}
      {product.discount > 0 && product.inStock && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 z-10 rounded-b-md px-2 py-1 bg-emerald-600">
          <span className="text-xs font-bold text-white">{product.discount}% OFF</span>
        </div>
      )}
      
      {!product.inStock && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 z-10 rounded-b-md px-2 py-1 bg-slate-500">
          <span className="text-xs font-bold text-white">Out of Stock</span>
        </div>
      )}
      
      {/* Image + Add button */}
      <div className="w-full h-[120px] bg-gray-50 rounded-t-xl flex items-center justify-center text-4xl relative">
        <img src={product.image} alt={product.name} className="max-h-full" />
        
        {/* Add button - moved into thumbnail */}
        {product.inStock && (
          <div className="absolute bottom-2 right-2">
            {quantity === 0 ? (
              <button 
                onClick={onAdd}
                className="w-8 h-8 rounded-md border-2 border-emerald-600 bg-transparent text-emerald-600 font-bold text-lg hover:bg-emerald-50 active:scale-105 transition-all"
              >
                +
              </button>
            ) : (
              <div className="flex items-center gap-1.5 px-2 h-8 rounded-md bg-emerald-600 text-white text-xs font-medium">
                <button onClick={onRemove} className="font-bold text-base">−</button>
                <span className="font-semibold">{quantity}</span>
                <button onClick={onAdd} className="font-bold text-base">+</button>
              </div>
            )}
          </div>
        )}
        
        {!product.inStock && (
          <div className="absolute bottom-2 right-2">
            <button className="px-2.5 h-8 bg-blue-600 text-white text-xs rounded-md font-medium flex items-center gap-1">
              <Bell className="w-3 h-3" />
              Notify
            </button>
          </div>
        )}
      </div>
      
      {/* Product info */}
      <div className="p-3 pt-2">
        <h3 className="text-sm font-medium truncate text-gray-900">{product.name}</h3>
        <p className="text-xs truncate text-gray-600">{product.detail}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-sm font-bold text-gray-900">₹{product.price.toLocaleString()}</span>
          {product.mrp > product.price && (
            <span className="text-xs line-through text-gray-400">₹{product.mrp.toLocaleString()}</span>
          )}
        </div>
      </div>
    </div>
  );
}
```

**React Native:**
```jsx
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { Bell } from 'lucide-react-native';

function ProductCard({ product, quantity, onAdd, onRemove }) {
  return (
    <View style={styles.card}>
      {/* Top badge */}
      {product.discount > 0 && product.inStock && (
        <View style={styles.discountBadge}>
          <Text style={styles.badgeText}>{product.discount}% OFF</Text>
        </View>
      )}
      
      {/* Image */}
      <View style={styles.imageContainer}>
        <Image source={{ uri: product.image }} style={styles.image} />
        
        {/* Add button */}
        {product.inStock && (
          <View style={styles.addButtonContainer}>
            {quantity === 0 ? (
              <TouchableOpacity onPress={onAdd} style={styles.addButtonOutline}>
                <Text style={styles.addButtonText}>+</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.quantitySelector}>
                <TouchableOpacity onPress={onRemove}>
                  <Text style={styles.quantityText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.quantityText}>{quantity}</Text>
                <TouchableOpacity onPress={onAdd}>
                  <Text style={styles.quantityText}>+</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>
      
      {/* Info */}
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{product.name}</Text>
        <Text style={styles.detail} numberOfLines={1}>{product.detail}</Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>₹{product.price.toLocaleString()}</Text>
          {product.mrp > product.price && (
            <Text style={styles.mrp}>₹{product.mrp.toLocaleString()}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4
  },
  discountBadge: {
    position: 'absolute',
    top: 0,
    alignSelf: 'center',
    zIndex: 10,
    backgroundColor: '#059669',
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFFFFF'
  },
  imageContainer: {
    height: 120,
    backgroundColor: '#F8FAFB',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative'
  },
  image: {
    maxHeight: '100%',
    maxWidth: '100%'
  },
  addButtonContainer: {
    position: 'absolute',
    bottom: 8,
    right: 8
  },
  addButtonOutline: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#059669',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center'
  },
  addButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#059669'
  },
  quantitySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#059669'
  },
  quantityText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF'
  },
  info: {
    padding: 12,
    paddingTop: 8
  },
  name: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0F172A'
  },
  detail: {
    fontSize: 12,
    color: '#64748B'
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4
  },
  price: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A'
  },
  mrp: {
    fontSize: 12,
    textDecorationLine: 'line-through',
    color: '#94A3B8'
  }
});
```

---

### Floating Cart Button (v3)

**React + Tailwind:**
```jsx
import { ChevronRight } from 'lucide-react';

function FloatingCartButton({ cartItems, cartItemCount }) {
  const displayItems = cartItems.slice(0, 3);
  
  return (
    <button className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white rounded-xl px-4 py-3 flex items-center gap-3 shadow-2xl min-w-[200px] active:scale-105 transition-transform">
      {/* Thumbnails - overlap at -12px */}
      {displayItems.length > 0 && (
        <div className="flex -space-x-3">
          {displayItems.map((item, idx) => (
            <div key={idx} className="w-9 h-9 bg-white border-2 border-white rounded-lg flex items-center justify-center text-lg">
              {item.image}
            </div>
          ))}
        </div>
      )}
      
      {/* Label - guaranteed single line */}
      <div className="flex-1 text-left">
        <div className="text-sm font-semibold whitespace-nowrap">View Cart</div>
        <div className="text-xs opacity-90">{cartItemCount} items</div>
      </div>
      
      {/* Arrow */}
      <ChevronRight className="w-4 h-4" />
    </button>
  );
}
```

---

### Cart Item Card (v3)

**React + Tailwind:**
```jsx
import { Trash2 } from 'lucide-react';

function CartItemCard({ item, onUpdateQuantity, onRemove }) {
  return (
    <div className="bg-white rounded-xl p-3 flex gap-3 shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
      {/* Image */}
      <div className="flex-none w-16 h-16 rounded-lg bg-gray-50 flex items-center justify-center text-2xl">
        {item.image}
      </div>
      
      {/* Info column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top row: Name/Detail + Quantity + Trash */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium truncate text-gray-900">{item.name}</h3>
            <p className="text-xs truncate text-gray-600">{item.detail}</p>
          </div>
          
          {/* Quantity selector - top-right */}
          <div className="flex items-center gap-2 px-2 h-7 bg-emerald-600 text-white rounded-md flex-none">
            <button onClick={() => onUpdateQuantity(-1)} className="font-bold text-sm">−</button>
            <span className="font-medium text-sm min-w-[14px] text-center">{item.quantity}</span>
            <button onClick={() => onUpdateQuantity(1)} className="font-bold text-sm">+</button>
          </div>
          
          {/* Trash icon - top-right corner */}
          <button onClick={onRemove} className="flex-none">
            <Trash2 className="w-4 h-4 text-red-600" />
          </button>
        </div>
        
        {/* Bottom row: Subtotal (no label, right-aligned) */}
        <div className="mt-2 text-right">
          <span className="text-sm font-semibold text-gray-900">₹{(item.price * item.quantity).toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}
```

---

### Cart Footer (v3 - Scrollable Bill + Fixed CTAs)

**React + Tailwind:**
```jsx
import { MapPin, MessageCircle, ArrowRight } from 'lucide-react';

function CartScreen({ cartItems }) {
  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const transport = 150;
  const total = subtotal + transport;
  
  return (
    <div className="min-h-screen pb-48">
      {/* Header */}
      <header className="sticky top-0 z-50 h-14 bg-white border-b border-gray-200 shadow-sm flex items-center px-4">
        <button className="w-10 h-10 flex items-center justify-center">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="flex-1 text-base font-semibold text-center mr-10 text-gray-900">Cart</h1>
      </header>
      
      {/* Scrollable content */}
      <div className="px-4 py-4 space-y-3">
        {/* Cart items */}
        {cartItems.map(item => (
          <CartItemCard key={item.id} item={item} />
        ))}
        
        {/* Bill Details - SCROLLABLE */}
        <div className="p-3 rounded-lg bg-gray-50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-900">Bill Details</span>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600">Item total ({totalItems} items)</span>
              <span className="text-xs font-medium text-gray-900">₹{subtotal.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600">Transport charges</span>
              <span className="text-xs font-medium text-gray-900">₹{transport}</span>
            </div>
            <div className="pt-1.5 mt-1.5 flex items-center justify-between border-t border-gray-200">
              <span className="text-sm font-semibold text-gray-900">To Pay</span>
              <span className="text-lg font-bold text-gray-900">₹{total.toLocaleString()}</span>
            </div>
          </div>
        </div>
        
        {/* Delivery Location - SCROLLABLE */}
        <div className="flex items-start gap-2 p-3 rounded-lg bg-gray-50">
          <MapPin className="w-4 h-4 mt-0.5 text-blue-600" />
          <div className="flex-1">
            <div className="text-xs font-semibold text-gray-900">Delivery to Himayatnagar Warehouse</div>
            <div className="text-xs text-gray-600">From WineYard Outlet, Banjara Hills • Est. 45 mins</div>
          </div>
        </div>
      </div>
      
      {/* Fixed footer - CLEAN */}
      <div className="fixed bottom-0 left-0 right-0 bg-white p-4 border-t border-gray-200 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] z-40">
        {/* Info ribbon - simple, no labels */}
        <div className="text-center text-xs text-gray-600 mb-2">
          {totalItems} items • ₹{total.toLocaleString()}
        </div>
        
        {/* Dual CTAs */}
        <div className="flex gap-2">
          <button className="flex-1 h-11 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 bg-white text-emerald-600 border-2 border-emerald-600 active:bg-emerald-50">
            <MessageCircle className="w-4 h-4" />
            WhatsApp Quote
          </button>
          <button className="flex-1 h-11 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 bg-emerald-600 text-white active:bg-emerald-700">
            Place Order
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

### Bottom Navigation (v3 - Fixed Z-Index)

**React + Tailwind:**
```jsx
import { Home, RefreshCw, Package, ClipboardList } from 'lucide-react';

function BottomTabs({ activeTab, onTabChange }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 h-14 bg-white flex border-t border-gray-200 z-40">
      <button 
        onClick={() => onTabChange('home')}
        className={`flex-1 flex flex-col items-center justify-center gap-1 ${activeTab === 'home' ? 'text-blue-600' : 'text-gray-600'}`}
      >
        <Home className="w-5 h-5" />
        <span className="text-xs font-medium">Home</span>
      </button>
      
      <button 
        onClick={() => onTabChange('buyagain')}
        className={`flex-1 flex flex-col items-center justify-center gap-1 ${activeTab === 'buyagain' ? 'text-blue-600' : 'text-gray-600'}`}
      >
        <RefreshCw className="w-5 h-5" />
        <span className="text-xs">Buy Again</span>
      </button>
      
      <button 
        onClick={() => onTabChange('categories')}
        className={`flex-1 flex flex-col items-center justify-center gap-1 ${activeTab === 'categories' ? 'text-blue-600' : 'text-gray-600'}`}
      >
        <Package className="w-5 h-5" />
        <span className="text-xs">Categories</span>
      </button>
      
      <button 
        onClick={() => onTabChange('orders')}
        className={`flex-1 flex flex-col items-center justify-center gap-1 ${activeTab === 'orders' ? 'text-blue-600' : 'text-gray-600'}`}
      >
        <ClipboardList className="w-5 h-5" />
        <span className="text-xs">Orders</span>
      </button>
    </nav>
  );
}
```

---

### Header with Scroll Behavior (v3 - Fixed)

**React + Tailwind:**
```jsx
import { useState, useEffect, useRef } from 'react';
import { MapPin, ChevronDown, Search, User } from 'lucide-react';

function CatalogHeader({ placeholders }) {
  const [headerState, setHeaderState] = useState('full'); // 'full' or 'collapsed'
  const [tabsVisible, setTabsVisible] = useState(true);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const lastScrollY = useRef(0);
  
  // Rotate placeholder every 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex(prev => (prev + 1) % placeholders.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [placeholders]);
  
  // Scroll behavior - FIXED v3
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const scrollingDown = currentScrollY > lastScrollY.current;
      const atTop = currentScrollY < 50;
      
      // Prevent flickering on scroll-to-top
      if (atTop) {
        setHeaderState('full');
        setTabsVisible(true);
      } else if (scrollingDown) {
        setHeaderState('collapsed');
        setTabsVisible(false);
      } else { // scrolling up
        setHeaderState('collapsed');
        setTabsVisible(true);
      }
      
      lastScrollY.current = currentScrollY;
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  
  return (
    <header 
      className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm transition-all duration-300"
      style={{ height: headerState === 'full' ? '120px' : '64px' }}
    >
      {/* Row 1: Location + Avatar (only when full, reduced spacing) */}
      {headerState === 'full' && (
        <div className="flex items-center justify-between px-4 h-14">
          <button className="flex items-center gap-2 text-sm font-medium text-gray-900">
            <MapPin className="w-4 h-4" />
            <span>Himayatnagar Warehouse</span>
            <ChevronDown className="w-3 h-3" />
          </button>
          <button className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center">
            <User className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      )}
      
      {/* Row 2: Search Bar - SINGLE USER ICON */}
      <div className="px-4 py-2 flex items-center gap-2">
        <div className="flex-1 relative">
          <input 
            type="text" 
            className="w-full h-11 pl-11 pr-4 rounded-full bg-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder={placeholders[placeholderIndex]}
          />
          <Search className="absolute left-4 top-3 w-5 h-5 text-gray-600" />
        </div>
        {/* Only show user icon when collapsed */}
        {headerState === 'collapsed' && (
          <button className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center">
            <User className="w-5 h-5 text-gray-600" />
          </button>
        )}
      </div>
    </header>
  );
}
```

---

### Product Detail Footer (v3 - Viewport Fix)

**React + Tailwind:**
```jsx
function ProductDetailScreen({ product }) {
  return (
    <div className="pb-48"> {/* Increased bottom padding to prevent cutoff */}
      {/* Content */}
      
      {/* Fixed footer - fully visible */}
      <div className="fixed bottom-0 left-0 right-0 bg-white p-4 border-t border-gray-200 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] z-40">
        {/* Variant grid */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {product.variants.map(variant => (
            <button
              key={variant.id}
              onClick={() => setSelectedVariant(variant)}
              className={`h-16 rounded-lg p-2 text-center transition-all ${
                selectedVariant.id === variant.id 
                  ? 'border-2 border-blue-600 bg-blue-50' 
                  : 'border-2 border-gray-200 bg-white'
              }`}
            >
              <div className="text-xs font-semibold text-gray-900">{variant.name}</div>
              <div className="text-xs mt-0.5 text-gray-600">{variant.detail}</div>
              <div className="text-xs font-semibold mt-0.5 text-gray-900">₹{variant.price.toLocaleString()}</div>
            </button>
          ))}
        </div>
        
        {/* Price + Add */}
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="text-xs font-medium text-gray-600">{selectedVariant.name} • {selectedVariant.detail}</div>
            <div className="text-base font-bold text-gray-900">₹{selectedVariant.price.toLocaleString()}</div>
          </div>
          
          {quantity === 0 ? (
            <button 
              onClick={addToCart}
              className="px-5 h-10 bg-emerald-600 text-white rounded-lg font-semibold text-sm flex items-center gap-2 active:bg-emerald-700"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          ) : (
            <div className="flex items-center gap-3 px-3 h-10 bg-emerald-600 text-white rounded-lg font-medium text-sm">
              <button onClick={removeFromCart} className="font-bold">−</button>
              <span className="font-semibold">{quantity}</span>
              <button onClick={addToCart} className="font-bold">+</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## Lucide Icons Setup

### React Web
```bash
npm install lucide-react
```

```jsx
import { Home, Search, User, ShoppingCart, Plus, Minus, Trash2 } from 'lucide-react';

<Home className="w-5 h-5 text-blue-600" />
```

### React Native
```bash
npm install lucide-react-native
```

```jsx
import { Home, Search, User } from 'lucide-react-native';

<Home size={20} color="#0066CC" />
```

### HTML (CDN)
```html
<script src="https://unpkg.com/lucide@latest"></script>
<i data-lucide="home"></i>
<script>lucide.createIcons();</script>
```

### Flutter
```yaml
dependencies:
  lucide_icons_flutter: ^1.0.0
```

```dart
import 'package:lucide_icons_flutter/lucide_icons.dart';

Icon(LucideIcons.home, size: 20, color: Color(0xFF0066CC))
```

---

## Responsive Breakpoints

### Mobile-First (Default)
```css
/* Base styles for mobile (375px-428px) */
.container {
  padding: 16px;
}
```

### Tablet (Optional)
```css
@media (min-width: 768px) {
  .product-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
```

---

## Performance Targets

### Core Web Vitals
```
LCP (Largest Contentful Paint): <2.5s
FID (First Input Delay): <100ms
CLS (Cumulative Layout Shift): <0.1
```

### Bundle Size
- Main bundle: <150KB gzipped
- Lazy-load product images
- Tree-shake Lucide icons

---

## Testing Matrix

### Devices (Priority Order)
1. Samsung Galaxy A-series (Android 12+)
2. Xiaomi Redmi (Android 11+)
3. iPhone 12/13/14 (iOS 15+)
4. OnePlus Nord (Android 12+)

### Browsers
- Chrome Mobile 90+
- Safari Mobile 14+
- Samsung Internet 15+

### Network Conditions
- 4G (Fast)
- 3G (Slow)
- Offline mode

---

## Common Pitfalls

### ❌ Wrong: Category tabs on Home
```jsx
<div className="flex gap-2 overflow-x-auto">
  <button>All</button>
  <button>Cameras</button>
  <button>NVR/DVR</button>
</div>
```

### ✅ Right: No category tabs (cleaner)
```jsx
{/* No category tabs - removed for simplicity */}
```

---

### ❌ Wrong: Circular add button
```jsx
<button className="w-8 h-8 rounded-full">+</button>
```

### ✅ Right: Rounded rect outline button
```jsx
<button className="w-8 h-8 rounded-md border-2 border-emerald-600">+</button>
```

---

### ❌ Wrong: Status banner always visible
```jsx
<div className="bg-green-50">Updated 2 min ago</div>
```

### ✅ Right: Only show when offline
```jsx
{!isOnline && (
  <div className="bg-amber-50">Offline • Will sync when online</div>
)}
```

---

### ❌ Wrong: Cart footer with bill details
```jsx
<div className="fixed bottom-0">
  <div>Bill Details...</div>
  <button>Place Order</button>
</div>
```

### ✅ Right: Bill details scrollable, footer clean
```jsx
{/* Scrollable bill details */}
<div className="px-4">
  <div>Bill Details...</div>
</div>

{/* Fixed clean footer */}
<div className="fixed bottom-0">
  <div className="text-center">49 items • ₹56,830</div>
  <div className="flex gap-2">
    <button>WhatsApp Quote</button>
    <button>Place Order</button>
  </div>
</div>
```

---

### ❌ Wrong: Duplicate user icons
```jsx
<div className="flex items-center gap-2">
  <input type="text" />
  <button><User /></button> {/* Duplicate */}
</div>
```

### ✅ Right: Single user icon (only when collapsed)
```jsx
<div className="flex items-center gap-2">
  <input type="text" />
  {headerState === 'collapsed' && (
    <button><User /></button>
  )}
</div>
```

---

## Accessibility Checklist

- [ ] All interactive elements 44×44px minimum
- [ ] Text contrast 4.5:1 minimum (AA)
- [ ] ARIA labels on icon-only buttons
- [ ] Focus indicators visible (2px outline)
- [ ] Screen reader announcements for cart updates
- [ ] Keyboard navigation support
- [ ] Reduced motion support (`prefers-reduced-motion`)

---

## Git Commit Template

```
feat(catalog): implement product card v3 design

- Add rounded-md outline button for empty state
- Move add button into thumbnail (bottom-2 right-2)
- Add top-aligned discount/stock badges
- Use emerald green (#059669) for CTAs

Refs: TRADER-123
```

---

## Quick Links

- **Design System:** TraderOps_Design_System_v3.md
- **Figma:** [Link to Figma file if created]
- **GitHub:** [Link to repo]
- **Slack:** #traderops-dev

---

**Document Status:** Final v3.0  
**Last Updated:** March 15, 2026  
**Maintained By:** TraderOps Team
