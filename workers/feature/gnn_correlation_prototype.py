
"""
GNN Worker - Graph Neural Networks
เรียนจากความสัมพันธ์แบบกราฟ
ใช้หา: BTC ร่วง -> เหรียญไหนร่วงตาม, ตรวจฟอกเงิน
"""
import torch
import torch.nn.functional as F
from torch_geometric.nn import GCNConv

class CoinCorrelationGNN(torch.nn.Module):
    def __init__(self, num_coins=150, hidden=64):
        super().__init__()
        self.conv1 = GCNConv(num_coins, hidden)
        self.conv2 = GCNConv(hidden, 32)
        
    def forward(self, x, edge_index, edge_weight=None):
        x = self.conv1(x, edge_index, edge_weight)
        x = F.relu(x)
        x = self.conv2(x, edge_index)
        return x
    
    def build_graph(self, correlation_matrix, threshold=0.8):
        # correlation >0.8 = edge
        edges = []
        weights = []
        n = len(correlation_matrix)
        for i in range(n):
            for j in range(i+1, n):
                if abs(correlation_matrix[i][j]) > threshold:
                    edges.append([i,j])
                    weights.append(correlation_matrix[i][j])
        print(f"🕸️ GNN Graph Built - Nodes: {n}, Edges: {len(edges)} - ใช้ใน NOVA: หาความสัมพันธ์เหรียญ")
        return edges, weights

if __name__ == "__main__":
    print("GNN Worker - 150 coins correlation graph")