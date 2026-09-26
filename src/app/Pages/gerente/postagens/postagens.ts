import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PostagemService } from '../../../services/postagem.service';

@Component({
  selector: 'app-postagens',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './postagens.html',
  styleUrls: ['./postagens.scss']
})
export class Postagens {
  postagemService = inject(PostagemService);
  
  textoPostagem = '';
  fotoPreviewUrl: string | null = null;

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      // Create local preview
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.fotoPreviewUrl = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }

  publicar() {
    if (this.textoPostagem.trim() || this.fotoPreviewUrl) {
      // Call service
      this.postagemService.publicar(this.textoPostagem, this.fotoPreviewUrl || undefined);
      // Clean up
      this.textoPostagem = '';
      this.fotoPreviewUrl = null;
    }
  }
}
