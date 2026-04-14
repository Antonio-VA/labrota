import type {SidebarsConfig} from '@docusaurus/plugin-content-docs'

const sidebars: SidebarsConfig = {
  docs: [
    'intro',
    {
      type: 'category',
      label: 'Schedule',
      items: ['schedule/overview', 'schedule/ai-generation', 'schedule/templates'],
    },
    {
      type: 'category',
      label: 'Staff',
      items: ['staff/managing-staff', 'staff/skills', 'staff/shift-types'],
    },
    {
      type: 'category',
      label: 'Leaves',
      items: ['leaves/overview', 'leaves/balance', 'leaves/requests'],
    },
    'lab-config',
    'reports',
    'settings',
  ],
}

export default sidebars
