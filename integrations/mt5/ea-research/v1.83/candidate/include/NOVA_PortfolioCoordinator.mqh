#ifndef NOVA_PORTFOLIO_COORDINATOR_MQH
#define NOVA_PORTFOLIO_COORDINATOR_MQH

#define NOVA_PORTFOLIO_SIGNATURE 0x4E565043
#define NOVA_PORTFOLIO_VERSION 1
#define NOVA_PORTFOLIO_MAX_RECORDS 16384

enum ENUM_NOVA_PORTFOLIO_STATE
{
   NOVA_PORTFOLIO_PREPARED=1,
   NOVA_PORTFOLIO_DISPATCHING=2,
   NOVA_PORTFOLIO_ACCEPTED=3,
   NOVA_PORTFOLIO_UNCERTAIN=4,
   NOVA_PORTFOLIO_RELEASED=5,
   NOVA_PORTFOLIO_RECONCILED=6
};

struct NOVA_PortfolioRecord
{
   uint      signature;
   uint      version;
   ulong     sequence;
   ulong     request_id;
   long      login;
   uint      server_hash;
   long      magic_base;
   long      magic;
   uint      symbol_hash;
   ulong     order_ticket;
   int       state;
   double    risk_money;
   datetime  created_at;
   datetime  broker_day;
   uint      checksum;
};

class CNOVAPortfolioCoordinator
{
private:
   string m_lock_path;
   string m_ledger_path;
   int    m_lock_handle;
   long   m_login;
   long   m_magic_base;
   uint   m_server_hash;

   uint Mix(uint hash,ulong value)
   {
      for(int i=0;i<8;i++)
      {
         hash=(hash^(uint)(value&0xFF))*16777619;
         value=value>>8;
      }
      return hash;
   }

   uint RecordChecksum(const NOVA_PortfolioRecord &r)
   {
      uint h=2166136261;
      h=Mix(h,r.signature); h=Mix(h,r.version);
      h=Mix(h,r.sequence); h=Mix(h,r.request_id);
      h=Mix(h,(ulong)r.login); h=Mix(h,r.server_hash);
      h=Mix(h,(ulong)r.magic_base); h=Mix(h,(ulong)r.magic);
      h=Mix(h,r.symbol_hash); h=Mix(h,r.order_ticket);
      h=Mix(h,(ulong)r.state);
      h=Mix(h,(ulong)MathMax(0,MathRound(r.risk_money*100000.0)));
      h=Mix(h,(ulong)r.created_at); h=Mix(h,(ulong)r.broker_day);
      return h;
   }

   bool ValidRecord(const NOVA_PortfolioRecord &r)
   {
      if(r.signature!=NOVA_PORTFOLIO_SIGNATURE || r.version!=NOVA_PORTFOLIO_VERSION) return false;
      if(r.login!=m_login || r.server_hash!=m_server_hash || r.magic_base!=m_magic_base) return false;
      if(r.request_id==0 || r.sequence==0 || r.risk_money<0 || !MathIsValidNumber(r.risk_money)) return false;
      if(r.state<NOVA_PORTFOLIO_PREPARED || r.state>NOVA_PORTFOLIO_RECONCILED) return false;
      return r.checksum==RecordChecksum(r);
   }

public:
   CNOVAPortfolioCoordinator()
   {
      m_lock_path="";
      m_ledger_path="";
      m_lock_handle=INVALID_HANDLE;
      m_login=0;
      m_magic_base=0;
      m_server_hash=0;
   }

   bool Init(const long login,const uint server_hash,const long magic_base)
   {
      if(login<=0 || server_hash==0 || magic_base<=0) return false;
      if(m_lock_handle!=INVALID_HANDLE) return false;
      m_login=login; m_server_hash=server_hash; m_magic_base=magic_base;
      FolderCreate("NOVA_PORTFOLIO",FILE_COMMON);
      ResetLastError();
      string scope=StringFormat("NOVA_PORTFOLIO\\NOVA_%I64d_%u_%I64d",m_login,m_server_hash,m_magic_base);
      m_lock_path=scope+".lock";
      m_ledger_path=scope+".ledger";
      return true;
   }

   bool Acquire()
   {
      if(m_lock_path=="" || m_lock_handle!=INVALID_HANDLE) return false;
      ResetLastError();
      // No FILE_SHARE flags: first opener gets exclusive access. This is same-host FILE_COMMON coordination.
      m_lock_handle=FileOpen(m_lock_path,FILE_READ|FILE_WRITE|FILE_BIN|FILE_COMMON);
      return m_lock_handle!=INVALID_HANDLE;
   }

   void Release()
   {
      if(m_lock_handle!=INVALID_HANDLE)
      {
         FileClose(m_lock_handle);
         m_lock_handle=INVALID_HANDLE;
      }
   }

   bool IsLocked() { return m_lock_handle!=INVALID_HANDLE; }
   string LedgerPath() { return m_ledger_path; }
   string LockPath() { return m_lock_path; }

   bool Load(NOVA_PortfolioRecord &records[])
   {
      if(!IsLocked()) return false;
      ArrayResize(records,0);
      if(!FileIsExist(m_ledger_path,FILE_COMMON)) return true;
      int f=FileOpen(m_ledger_path,FILE_READ|FILE_BIN|FILE_COMMON);
      if(f==INVALID_HANDLE) return false;
      ulong bytes=FileSize(f);
      ulong record_bytes=(ulong)sizeof(NOVA_PortfolioRecord);
      if(record_bytes==0 || bytes%record_bytes!=0 || bytes/record_bytes>NOVA_PORTFOLIO_MAX_RECORDS)
      {
         FileClose(f);
         return false;
      }
      int count=(int)(bytes/record_bytes);
      if(ArrayResize(records,count)!=count) { FileClose(f); return false; }
      for(int i=0;i<count;i++)
      {
         if(FileReadStruct(f,records[i])!=sizeof(NOVA_PortfolioRecord) || !ValidRecord(records[i]))
         {
            FileClose(f);
            ArrayResize(records,0);
            return false;
         }
      }
      FileClose(f);
      return true;
   }

   bool Append(NOVA_PortfolioRecord &record)
   {
      if(!IsLocked()) return false;
      record.signature=NOVA_PORTFOLIO_SIGNATURE;
      record.version=NOVA_PORTFOLIO_VERSION;
      record.login=m_login;
      record.server_hash=m_server_hash;
      record.magic_base=m_magic_base;
      record.checksum=RecordChecksum(record);
      int f=FileOpen(m_ledger_path,FILE_READ|FILE_WRITE|FILE_BIN|FILE_COMMON);
      if(f==INVALID_HANDLE) return false;
      FileSeek(f,0,SEEK_END);
      uint written=FileWriteStruct(f,record);
      FileFlush(f);
      FileClose(f);
      return written==sizeof(NOVA_PortfolioRecord);
   }

   ulong NextId(const NOVA_PortfolioRecord &records[])
   {
      ulong maximum=0;
      for(int i=0;i<ArraySize(records);i++)
         if(records[i].sequence>maximum) maximum=records[i].sequence;
      if(maximum==0xFFFFFFFFFFFFFFFF) return 0;
      return maximum+1;
   }

   bool Latest(const NOVA_PortfolioRecord &records[],const ulong request_id,NOVA_PortfolioRecord &latest)
   {
      for(int i=ArraySize(records)-1;i>=0;i--)
      {
         if(records[i].request_id==request_id)
         {
            latest=records[i];
            return true;
         }
      }
      return false;
   }

   bool ActiveTotals(const NOVA_PortfolioRecord &records[],double &risk,int &count)
   {
      risk=0; count=0;
      int n=ArraySize(records);
      for(int i=0;i<n;i++)
      {
         bool superseded=false;
         for(int j=i+1;j<n;j++)
            if(records[j].request_id==records[i].request_id) { superseded=true; break; }
         if(superseded) continue;
         int state=records[i].state;
         if(state==NOVA_PORTFOLIO_PREPARED || state==NOVA_PORTFOLIO_DISPATCHING ||
            state==NOVA_PORTFOLIO_ACCEPTED || state==NOVA_PORTFOLIO_UNCERTAIN)
         {
            risk+=records[i].risk_money;
            count++;
         }
      }
      return MathIsValidNumber(risk) && risk>=0 && count>=0;
   }

   bool Compact(NOVA_PortfolioRecord &records[])
   {
      int n=ArraySize(records);
      if(n<512) return true;
      if(n>NOVA_PORTFOLIO_MAX_RECORDS) return false;

      // The ledger is append-only between compactions. Keep only the latest record
      // for every active request plus the highest-sequence terminal record as a
      // monotonic ID watermark. Open requests therefore survive compaction/restart.
      int slots=1;
      while(slots<n*2) slots*=2;
      if(slots>65536) return false;
      ulong seen[];
      if(ArrayResize(seen,slots)!=slots) return false;
      ArrayInitialize(seen,0);
      NOVA_PortfolioRecord kept[];
      int kept_count=0;
      for(int i=n-1;i>=0;i--)
      {
         ulong id=records[i].request_id;
         if(id==0) return false;
         int slot=(int)(id%(ulong)slots);
         while(seen[slot]!=0 && seen[slot]!=id) slot=(slot+1)%slots;
         if(seen[slot]==id) continue;
         seen[slot]=id;
         int state=records[i].state;
         if(state==NOVA_PORTFOLIO_PREPARED || state==NOVA_PORTFOLIO_DISPATCHING ||
            state==NOVA_PORTFOLIO_ACCEPTED || state==NOVA_PORTFOLIO_UNCERTAIN)
         {
            if(ArrayResize(kept,kept_count+1)!=kept_count+1) return false;
            kept[kept_count++]=records[i];
         }
      }

      // Preserve the global sequence high-water mark even if its request is terminal.
      ulong high_id=records[n-1].request_id;
      int high_slot=(int)(high_id%(ulong)slots);
      while(seen[high_slot]!=0 && seen[high_slot]!=high_id) high_slot=(high_slot+1)%slots;
      if(seen[high_slot]!=high_id)
      {
         if(ArrayResize(kept,kept_count+1)!=kept_count+1) return false;
         kept[kept_count++]=records[n-1];
      }
      if(kept_count<=0 || kept_count>=NOVA_PORTFOLIO_MAX_RECORDS) return false;

      string temp_path=m_ledger_path+".compact.tmp";
      FileDelete(temp_path,FILE_COMMON);
      int f=FileOpen(temp_path,FILE_WRITE|FILE_BIN|FILE_COMMON);
      if(f==INVALID_HANDLE) return false;
      bool written_ok=true;
      for(int i=0;i<kept_count;i++)
      {
         if(FileWriteStruct(f,kept[i])!=sizeof(NOVA_PortfolioRecord))
         { written_ok=false; break; }
      }
      FileFlush(f);
      FileClose(f);
      if(!written_ok)
      {
         FileDelete(temp_path,FILE_COMMON);
         return false;
      }
      if(!FileMove(temp_path,FILE_COMMON,m_ledger_path,FILE_COMMON|FILE_REWRITE))
      {
         FileDelete(temp_path,FILE_COMMON);
         return false;
      }
      if(ArrayResize(records,kept_count)!=kept_count) return false;
      for(int i=0;i<kept_count;i++) records[i]=kept[i];
      return true;
   }
};

#endif
