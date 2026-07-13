Component({properties:{title:{type:String,value:''},action:{type:String,value:''}},methods:{onAction(){this.triggerEvent('action');}}});
