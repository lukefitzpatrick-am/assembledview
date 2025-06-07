import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BarChart,
  Bell,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Circle,
  Clock,
  Copy,
  CreditCard,
  Download,
  Edit,
  FileText,
  Filter,
  Home,
  Info,
  LayoutDashboard,
  LineChart,
  Loader2,
  LogOut,
  Mail,
  Menu,
  MessageSquare,
  Moon,
  MoreHorizontal,
  MoreVertical,
  Plus,
  Search,
  Settings,
  Share,
  Sun,
  Trash,
  Upload,
  User,
  Users,
  X,
  Github,
  Mail as MailIcon,
  Twitter as TwitterIcon,
} from "lucide-react"
import { LucideProps } from "lucide-react"
import { ForwardRefExoticComponent, RefAttributes } from "react"

type IconComponent = ForwardRefExoticComponent<Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>>

type IconName = 
  | "alertCircle"
  | "arrowLeft"
  | "arrowRight"
  | "barChart"
  | "bell"
  | "calendar"
  | "check"
  | "chevronDown"
  | "chevronRight"
  | "chevronUp"
  | "circle"
  | "clock"
  | "copy"
  | "creditCard"
  | "download"
  | "edit"
  | "fileText"
  | "filter"
  | "home"
  | "info"
  | "layoutDashboard"
  | "lineChart"
  | "loader2"
  | "logOut"
  | "mail"
  | "menu"
  | "messageSquare"
  | "moon"
  | "moreHorizontal"
  | "moreVertical"
  | "plus"
  | "search"
  | "settings"
  | "share"
  | "sun"
  | "trash"
  | "upload"
  | "user"
  | "users"
  | "x"
  | "google"
  | "apple"
  | "twitter"

export const Icons: {
  [key: string]: IconComponent
} = {
  alertCircle: AlertCircle,
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  barChart: BarChart,
  bell: Bell,
  calendar: Calendar,
  check: Check,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  chevronUp: ChevronUp,
  circle: Circle,
  clock: Clock,
  copy: Copy,
  creditCard: CreditCard,
  download: Download,
  edit: Edit,
  fileText: FileText,
  filter: Filter,
  home: Home,
  info: Info,
  layoutDashboard: LayoutDashboard,
  lineChart: LineChart,
  loader2: Loader2,
  logOut: LogOut,
  mail: MailIcon,
  menu: Menu,
  messageSquare: MessageSquare,
  moon: Moon,
  moreHorizontal: MoreHorizontal,
  moreVertical: MoreVertical,
  plus: Plus,
  search: Search,
  settings: Settings,
  share: Share,
  sun: Sun,
  trash: Trash,
  upload: Upload,
  user: User,
  users: Users,
  x: X,
  google: Github,
  apple: MailIcon,
  twitter: TwitterIcon,
} 