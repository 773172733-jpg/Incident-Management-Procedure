Page({data:{tab:'pending'},onShow(){if(this.getTabBar())this.getTabBar().setData({selected:2});},choose(e){this.setData({tab:e.currentTarget.dataset.tab});}});
