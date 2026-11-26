#ifndef NOVA_BROKER_ADAPTER_MQH
#define NOVA_BROKER_ADAPTER_MQH

#include <Trade\Trade.mqh>

ulong gNOVA_BrokerMutationAttempts=0;
ulong gNOVA_BrokerMutationBlocked=0;
ulong gNOVA_BrokerTransportCalls=0;

bool NOVA_BrokerOrderSend(const MqlTradeRequest &request,MqlTradeResult &result,const bool hard_disabled)
{
   gNOVA_BrokerMutationAttempts++;
   if(hard_disabled)
   {
      gNOVA_BrokerMutationBlocked++;
      ZeroMemory(result);
      return false;
   }
   gNOVA_BrokerTransportCalls++;
   return OrderSend(request,result);
}

bool NOVA_BrokerPositionModify(CTrade &trade,const ulong ticket,const double sl,const double tp,const bool hard_disabled)
{
   gNOVA_BrokerMutationAttempts++;
   if(hard_disabled)
   {
      gNOVA_BrokerMutationBlocked++;
      return false;
   }
   gNOVA_BrokerTransportCalls++;
   return trade.PositionModify(ticket,sl,tp);
}

bool NOVA_BrokerAdapterSelfTest(CTrade &trade,const bool hard_disabled)
{
   if(!hard_disabled) return false;
   gNOVA_BrokerMutationAttempts=0;
   gNOVA_BrokerMutationBlocked=0;
   gNOVA_BrokerTransportCalls=0;
   MqlTradeRequest request;
   MqlTradeResult result;
   ZeroMemory(request);
   ZeroMemory(result);
   bool order_result=NOVA_BrokerOrderSend(request,result,hard_disabled);
   bool modify_result=NOVA_BrokerPositionModify(trade,0,0,0,hard_disabled);
   bool passed=(!order_result && !modify_result &&
                gNOVA_BrokerMutationAttempts==2 &&
                gNOVA_BrokerMutationBlocked==2 &&
                gNOVA_BrokerTransportCalls==0);
   PrintFormat("[NOVA BROKER ADAPTER SELFTEST] %s attempts=%I64u blocked=%I64u transport=%I64u",
               passed?"PASS":"FAIL",gNOVA_BrokerMutationAttempts,
               gNOVA_BrokerMutationBlocked,gNOVA_BrokerTransportCalls);
   return passed;
}

#endif
